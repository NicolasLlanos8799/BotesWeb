import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import { notifyGYGAvailability } from "../lib/gyg-notify.js";
import { withRetry } from "../lib/withRetry.js";
import { ensureDiscountSchema, redeemDiscountForBooking } from "../lib/discounts.js";

export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(200).json({ received: true });
  }

  try {
    const event = req.body;
    const checkoutId = event.id || (event.data && event.data.id);
    if (!checkoutId) return res.status(200).json({ received: true });

    // 1. Verify with SumUp
    const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!response.ok) throw new Error("SumUp verify failed");
    const checkout = await response.json();

    if (checkout.status === "PAID") {
      const metadata = checkout.metadata;

      if (metadata && metadata.date && metadata.time) {
        // 2. Save to Postgres (idempotent).
        // Retried: a transient connection blip must not turn into a
        // booking that only exists in Google Calendar. If it still fails
        // after retries, bail out before step 4 (GAS) — the fallback
        // endpoint (api/create-booking-from-payment.js) still runs on the
        // frontend and will retry the insert itself.
        let dbSaved = true;
        try {
          await withRetry(() => ensureDiscountSchema());
          await withRetry(() => db`
            INSERT INTO bookings
              (tour_id, tour_name, customer_name, customer_email, customer_phone,
               passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang,
               discount_code, discount_percent)
            VALUES
              (${metadata.tour || null},
               ${metadata.tourTitle || null},
               ${metadata.name || null},
               ${metadata.email || null},
               ${metadata.phone || null},
               ${metadata.qty || 1},
               ${metadata.date},
               ${metadata.time},
               ${metadata.total || checkout.amount || 0},
               'PAID',
               ${checkoutId},
               ${metadata.lang || 'english'},
               ${metadata.discount_code || null},
               ${metadata.discount_percent ? parseInt(metadata.discount_percent) : null})
            ON CONFLICT (sumup_id) DO UPDATE SET payment_status = 'PAID'
          `);
          await withRetry(() => redeemDiscountForBooking(checkoutId)).catch(e => logError("Webhook: discount redeem failed:", e.message, checkoutId));
          log("Webhook: Saved to Postgres:", checkoutId);
        } catch (dbErr) {
          if (dbErr.code === '23505') {
            log("Webhook: Duplicate in Postgres, skipping insert.");
          } else {
            dbSaved = false;
            logError("Webhook: Postgres error after retries — NOT calling GAS, letting fallback endpoint retry:", dbErr.message, checkoutId);
          }
        }

        if (!dbSaved) {
          return res.status(200).json({ received: true, warning: "DB save failed after retries; fallback endpoint will retry." });
        }

        // 3. Calculate group number for wine tour
        let groupNumber = null;
        if (metadata.tour === "book-wine") {
          try {
            const ACTIVE_STATUSES = ["PAID", "RESERVED", "PENDING"];
            const countResult = await db`
              SELECT COUNT(*) as group_count
              FROM bookings
              WHERE tour_id = 'book-wine'
                AND booking_date = ${metadata.date}
                AND booking_time = ${metadata.time}
                AND payment_status = ANY(${ACTIVE_STATUSES})
                AND sumup_id != ${checkoutId}
            `;
            const countRows = countResult.rows ?? countResult;
            // Groups already confirmed before this one → this is group N+1
            groupNumber = Number(countRows[0]?.group_count || 0) + 1;
          } catch (e) {
            warn("[wine group] Could not calculate group number:", e.message);
          }
        }

        // 4. Trigger GAS — Google Calendar + confirmation email
        const bookingData = {
          ...metadata,
          payment_status: "PAID",
          sumup_checkout_id: checkoutId,
          amount: checkout.amount,
          currency: checkout.currency,
          ...(groupNumber ? { groupNumber } : {})
        };
        log("Webhook: Sending to GAS...");
        await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createBooking", ...bookingData })
        });

        // Notify GYG — fire-and-forget (non-fatal, booking already saved)
        notifyGYGAvailability(metadata.tour, metadata.date, metadata.time)
          .catch(e => warn("[GYG notify] Error:", e.message));
      } else {
        warn("Webhook: Missing metadata, fallback endpoint will handle it.");
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logError("Webhook Error:", error.message);
    return res.status(200).json({ received: true, warning: error.message });
  }
}
