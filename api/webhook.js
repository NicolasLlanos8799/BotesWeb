import db from "../lib/db.js";

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
        // 2. Save to Postgres (idempotent)
        try {
          await db`
            INSERT INTO bookings
              (tour_id, tour_name, customer_name, customer_email, customer_phone,
               passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang)
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
               ${metadata.lang || 'english'})
            ON CONFLICT (sumup_id) DO UPDATE SET payment_status = 'PAID'
          `;
          console.log("Webhook: Saved to Postgres:", checkoutId);
        } catch (dbErr) {
          console.error("Webhook: Postgres error:", dbErr.message);
        }

        // 3. Trigger GAS — Google Calendar + confirmation email
        const bookingData = {
          ...metadata,
          payment_status: "PAID",
          sumup_checkout_id: checkoutId,
          amount: checkout.amount,
          currency: checkout.currency
        };
        console.log("Webhook: Sending to GAS...");
        await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createBooking", ...bookingData })
        });
      } else {
        console.warn("Webhook: Missing metadata, fallback endpoint will handle it.");
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(200).json({ received: true, warning: error.message });
  }
}
