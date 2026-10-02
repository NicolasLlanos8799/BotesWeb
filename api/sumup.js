import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";
import { ensureDiscountSchema, findValidDiscount, acquireDiscountHold, releaseDiscountHold, computeSubtotal, isDiscountApplicable, applyDiscount, discountMetadata, redeemDiscountForBooking } from "../lib/discounts.js";

const ALLOWED_HOSTNAMES = ["seaduced-experience.com", "vercel.app", "localhost", "127.0.0.1", "seaduced.dk"];

// Exact-match or proper-subdomain match against the allowlist — never substring match.
function isAllowedHostname(hostname) {
  if (!hostname) return false;
  return ALLOWED_HOSTNAMES.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function extractHostname(headerValue) {
  if (!headerValue) return "";
  try {
    return new URL(headerValue).hostname;
  } catch {
    return "";
  }
}

/**
 * Vercel Serverless Function: SumUp API Proxy
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;

  log("SumUp Token Presence:", !!ACCESS_TOKEN);

  const originHost = extractHostname(req.headers.origin);
  const refererHost = extractHostname(req.headers.referer);
  const isAllowedDomain = isAllowedHostname(originHost) || isAllowedHostname(refererHost);

  // Enforced in every environment — Origin/Referer are not a real auth boundary,
  // but they should never be skipped just because NODE_ENV isn't "production".
  if (!isAllowedDomain) {
    warn("SumUp Proxy: Blocked request from unauthorized origin:", originHost || refererHost || "None");
    return res.status(403).json({ error: "Forbidden: Unauthorized Origin" });
  }

  const { action } = req.query;

  // Public discount-code check (no SumUp token needed). Never reveals why a code is invalid.
  if (action === "validateDiscount") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (isRateLimited(`discount-check:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
      return res.status(429).json({ valid: false, error: "Too many attempts. Try again later." });
    }
    try {
      const discount = await findValidDiscount(req.body?.code);
      if (!discount) return res.status(200).json({ valid: false });
      const subtotal = computeSubtotal(req.body?.tour, req.body?.tapas);
      if (subtotal !== null && !isDiscountApplicable(subtotal, discount)) {
        return res.status(200).json({ valid: false, reason: "TOO_HIGH" });
      }
      return res.status(200).json({ valid: true, code: discount.code, type: discount.type, percent: discount.percent, amount: discount.amount_dkk });
    } catch (err) {
      logError("validateDiscount error:", err.message);
      return res.status(500).json({ valid: false, error: "Could not validate code" });
    }
  }

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: "SumUp Access Token not configured on server." });
  }

  try {
    if (action === "createCheckout") {
      if (isRateLimited(`sumup-checkout:${getIp(req)}`, { max: 15, windowMs: 15 * 60 * 1000 })) {
        return res.status(429).json({ error: "Too many requests. Try again later." });
      }

      let { amount, currency, checkout_reference, return_url, description, metadata } = req.body;

      if (!amount || !currency || !checkout_reference) {
         return res.status(400).json({ error: "Missing required fields (amount, currency, reference)" });
      }

      // Discount code: never trust the client amount — recompute from server-side prices.
      if (metadata) {
        delete metadata.discount_code;
        delete metadata.discount_percent;
        delete metadata.discount_type;
        delete metadata.discount_amount_dkk;
        delete metadata.discount_amount;
      }
      const requestedCode = req.body.discount_code;
      let heldDiscountCode = null; // one use reserved for this checkout until it is paid or expires
      if (requestedCode && metadata) {
        const subtotal = computeSubtotal(metadata.tour, metadata.tapas);
        const discount = subtotal === null ? null : await findValidDiscount(requestedCode);
        if (!discount) {
          return res.status(400).json({ error: "DISCOUNT_INVALID", message: "Discount code is invalid, expired or fully used." });
        }
        if (!isDiscountApplicable(subtotal, discount)) {
          return res.status(400).json({ error: "DISCOUNT_TOO_HIGH", message: "This code cannot be applied: the discount is greater than or equal to the total." });
        }
        amount = applyDiscount(subtotal, discount);
        Object.assign(metadata, discountMetadata(discount, subtotal));
      }

      // Wine group experience: validate group capacity before creating checkout
      if (metadata && (metadata.calendar === "book-wine" || metadata.tour === "book-wine")) {
        const qty = parseInt(metadata.qty) || 1;

        // Max 6 pax per group
        if (qty > 6) {
          return res.status(400).json({
            error: "MAX_PAX_EXCEEDED",
            message: "A single booking cannot exceed 6 people. Please contact us for larger groups."
          });
        }

        // Max 2 groups per slot (race-condition safe: check right before creating checkout)
        if (metadata.date && metadata.time) {
          const ACTIVE_STATUSES = ["PAID", "RESERVED", "PENDING"];
          const countResult = await db`
            SELECT COUNT(*) as group_count
            FROM bookings
            WHERE tour_id = 'book-wine'
              AND booking_date = ${metadata.date}
              AND booking_time = ${metadata.time}
              AND payment_status = ANY(${ACTIVE_STATUSES})
              AND NOT (payment_status = 'PENDING' AND created_at < NOW() - INTERVAL '1 hour')
          `;
          const countRows = countResult.rows ?? countResult;
          const groupCount = Number(countRows[0]?.group_count || 0);
          if (groupCount >= 2) {
            return res.status(409).json({
              error: "SLOT_FULL",
              message: "This time slot is fully booked. Please choose another time."
            });
          }
        }
      }

      // Reserve the use atomically right before creating the checkout, so two customers
      // can never both take the last use of a code.
      if (metadata && metadata.discount_code) {
        const held = await acquireDiscountHold(metadata.discount_code, metadata.email);
        if (!held) {
          return res.status(400).json({ error: "DISCOUNT_INVALID", message: "Discount code is invalid, expired or fully used." });
        }
        heldDiscountCode = held.code;
      }

      let sumupResponse, data;
      try {
        sumupResponse = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            amount,
            currency,
            checkout_reference,
            return_url,
            description,
            metadata,
            merchant_code: process.env.SUMUP_MERCHANT_CODE,
            hosted_checkout: {
              enabled: true
            }
          })
        });
        data = await sumupResponse.json();
      } catch (fetchErr) {
        if (heldDiscountCode) await releaseDiscountHold(heldDiscountCode).catch(() => {});
        throw fetchErr;
      }

      if (!sumupResponse.ok) {
        logError("SumUp API Error Details:", JSON.stringify(data, null, 2));
        if (heldDiscountCode) await releaseDiscountHold(heldDiscountCode).catch(() => {});
      }

      // Save as PENDING immediately — captures abandoned bookings too.
      // If the user pays, the webhook/fallback will UPDATE status to PAID.
      if (sumupResponse.ok && data.id && metadata) {
        try {
          await ensureDiscountSchema();
          await db`
            INSERT INTO bookings
              (tour_id, tour_name, customer_name, customer_email, customer_phone,
               passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang,
               discount_code, discount_percent, discount_amount_dkk, discount_hold)
            VALUES
              (${metadata.tour || null},
               ${metadata.tourTitle || null},
               ${metadata.name || null},
               ${metadata.email || null},
               ${metadata.phone || null},
               ${parseInt(metadata.qty) || 1},
               ${metadata.date || null},
               ${metadata.time || null},
               ${parseFloat(metadata.total) || amount},
               'PENDING',
               ${data.id},
               ${metadata.lang || 'english'},
               ${metadata.discount_code || null},
               ${metadata.discount_percent ? parseInt(metadata.discount_percent) : null},
               ${metadata.discount_amount_dkk ? parseInt(metadata.discount_amount_dkk) : null},
               ${Boolean(heldDiscountCode)})
            ON CONFLICT (sumup_id) DO NOTHING
          `;
          log("createCheckout: PENDING booking saved for", data.id);
        } catch (dbErr) {
          // No booking row carries the hold, so nothing would ever release it.
          if (heldDiscountCode) await releaseDiscountHold(heldDiscountCode).catch(() => {});
          // Non-blocking — don't fail the checkout if DB write fails
          logError("createCheckout: DB error (non-blocking):", dbErr.message);
        }
      }

      return res.status(sumupResponse.status).json(data);
    }
    
    if (action === "getCheckoutStatus") {
      const { checkout_id } = req.query;
      if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

      const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`
        }
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (action === "webhook") {
      const event = req.body;
      log("Webhook Received:", JSON.stringify(event));

      const isPaidEvent = event.event_type === "checkout.paid";
      const isStatusChangedEvent = event.event_type === "CHECKOUT_STATUS_CHANGED";

      if (isPaidEvent || isStatusChangedEvent) {
        const checkoutId = event.id;
        log("Processing Webhook for Checkout ID:", checkoutId);

        const detailsResponse = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
        });
        
        if (!detailsResponse.ok) {
          logError("Webhook: Failed to fetch checkout details.");
          return res.status(200).json({ received: true, warning: "Verification failed" });
        }

        const details = await detailsResponse.json();
        log("Checkout Status Verified:", details.status);

        if (details.status === "PAID") {
          const GAS_URL = process.env.GAS_URL;
          const metadata = details.metadata || {};

          if (metadata.date && metadata.time) {
            // Save to Postgres (idempotent)
            try {
              await ensureDiscountSchema();
              await db`
                INSERT INTO bookings
                  (tour_id, tour_name, customer_name, customer_email, customer_phone,
                   passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang,
                   discount_code, discount_percent, discount_amount_dkk)
                VALUES
                  (${metadata.tour || null},
                   ${metadata.tourTitle || null},
                   ${metadata.name || null},
                   ${metadata.email || null},
                   ${metadata.phone || null},
                   ${metadata.qty || 1},
                   ${metadata.date},
                   ${metadata.time},
                   ${metadata.total || details.amount || 0},
                   'PAID',
                   ${checkoutId},
                   ${metadata.lang || 'english'},
                   ${metadata.discount_code || null},
                   ${metadata.discount_percent ? parseInt(metadata.discount_percent) : null},
                   ${metadata.discount_amount_dkk ? parseInt(metadata.discount_amount_dkk) : null})
                ON CONFLICT (sumup_id) DO UPDATE SET payment_status = 'PAID'
              `;
              await redeemDiscountForBooking(checkoutId);
              log("Webhook (sumup.js): Saved/updated to Postgres:", checkoutId);
            } catch (dbErr) {
              logError("Webhook (sumup.js): Postgres error:", dbErr.message);
            }

            // Trigger GAS — Google Calendar + email
            const bookingData = {
              ...metadata,
              payment_status: "PAID",
              sumup_checkout_id: checkoutId,
              amount: details.amount,
              currency: details.currency
            };
            log("Webhook: BOOKING DATA:", JSON.stringify(bookingData));
            const gasResponse = await fetch(GAS_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "createBooking", ...bookingData })
            });
            const gasResult = await gasResponse.text();
            log("Webhook: GAS response", gasResponse.status, gasResult);
          } else {
            warn("Webhook: Missing date/time in metadata, skipping GAS");
          }
        }
      }

      return res.status(200).json({ received: true });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    logError("SumUp Proxy Error:", error);
    return res.status(502).json({ success: false, error: "Failed to communicate with SumUp API." });
  }
}
