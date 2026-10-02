import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import { notifyGYGAvailability } from "../lib/gyg-notify.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";
import { withRetry } from "../lib/withRetry.js";
import { ensureDiscountSchema, redeemDiscountForBooking } from "../lib/discounts.js";

/**
 * Production-Safe Booking Fallback Endpoint
 *
 * Verifies payment with SumUp, saves to Postgres, and triggers GAS for
 * Google Calendar event + confirmation email.
 * Idempotent — Postgres deduplicates via sumup_id UNIQUE constraint.
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isRateLimited(`booking-fallback:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  const { checkout_id, metadata: frontendMetadata } = req.body || {};
  if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

  try {
    log("[FALLBACK] Verifying checkout:", checkout_id);

    // 1. VERIFY payment with SumUp (NEVER trust frontend)
    const sumupRes = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!sumupRes.ok) return res.status(502).json({ error: "Could not verify payment" });
    const checkout = await sumupRes.json();

    if (checkout.status !== "PAID") {
      log("[FALLBACK] Not PAID. Status:", checkout.status);
      return res.status(200).json({ success: false, message: "Payment not completed" });
    }

    // 2. GET metadata (SumUp first, then frontend backup)
    let metadata = null;
    if (checkout.metadata && Object.keys(checkout.metadata).length > 0) {
      metadata = checkout.metadata;
      log("[FALLBACK] Using metadata from SumUp");
    } else if (frontendMetadata && Object.keys(frontendMetadata).length > 0) {
      metadata = frontendMetadata;
      log("[FALLBACK] Using metadata from Frontend");
    }

    if (!metadata || !metadata.date || !metadata.time) {
      logError("[FALLBACK] No valid metadata for:", checkout_id);
      return res.status(400).json({ error: "Metadata not found" });
    }

    // 3. SAVE to Postgres (idempotent — ON CONFLICT DO NOTHING).
    // Retried: a transient connection blip here must not turn into a
    // booking that only exists in Google Calendar. If it still fails
    // after retries, we stop BEFORE calling GAS — the payment stays
    // verified, so the fallback/webhook retry (SumUp still shows PAID)
    // or a manual admin re-run can pick it up without an orphaned event.
    const extrasNum = Number.isFinite(parseInt(metadata.tapas)) ? parseInt(metadata.tapas) : 0;
    try {
      await withRetry(() => ensureDiscountSchema());
      await withRetry(() => db`
        INSERT INTO bookings (
          tour_id, tour_name, customer_name, customer_email, customer_phone,
          passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang, extras,
          discount_code, discount_percent
        ) VALUES (
          ${metadata.tour || null},
          ${metadata.tourTitle || null},
          ${metadata.name || null},
          ${metadata.email || null},
          ${metadata.phone || null},
          ${metadata.qty || 1},
          ${metadata.date || null},
          ${metadata.time || null},
          ${metadata.total || checkout.amount || 0},
          'PAID',
          ${checkout_id},
          ${metadata.lang || 'english'},
          ${extrasNum},
          ${checkout.metadata?.discount_code || null},
          ${checkout.metadata?.discount_percent ? parseInt(checkout.metadata.discount_percent) : null}
        )
        ON CONFLICT (sumup_id) DO UPDATE SET payment_status = 'PAID'
      `);
      await withRetry(() => redeemDiscountForBooking(checkout_id)).catch(e => logError("[FALLBACK] discount redeem failed:", e.message, checkout_id));
      log("[FALLBACK] Saved to Postgres.");
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        log("[FALLBACK] Duplicate in Postgres, skipping insert.");
      } else {
        logError("[FALLBACK] Postgres error after retries — NOT calling GAS, booking would be calendar-only:", dbErr.message, checkout_id);
        return res.status(500).json({
          success: false,
          error: "Could not save booking after retries. Payment is verified (checkout_id: " + checkout_id + ") — retry this endpoint or add the booking manually.",
        });
      }
    }

    // 4. TRIGGER GAS — creates Google Calendar event + sends confirmation email
    const bookingData = {
      ...metadata,
      payment_status: "PAID",
      sumup_checkout_id: checkout_id,
      amount: checkout.amount,
      currency: checkout.currency
    };
    log("[FALLBACK] Sending to GAS:", JSON.stringify(bookingData));

    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createBooking", ...bookingData })
    });

    const gasResult = await gasResponse.text();
    log("[FALLBACK] GAS response:", gasResponse.status, gasResult);

    // 5. NOTIFY GYG — fire-and-forget (non-fatal, booking already saved)
    notifyGYGAvailability(metadata.tour, metadata.date, metadata.time)
      .catch(e => warn("[GYG notify] Error:", e.message));

    return res.status(200).json({ success: true, booking_created: true });

  } catch (error) {
    logError("[FALLBACK] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
