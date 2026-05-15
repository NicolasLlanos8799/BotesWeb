import db from "../lib/db.js";

/**
 * Production-Safe Booking Fallback Endpoint
 * 
 * Verifies payment with SumUp and ensures booking is created in Google Calendar.
 * Idempotent — GAS deduplicates via sumup_checkout_id.
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { checkout_id, metadata: frontendMetadata } = req.body || {};
  if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

  try {
    console.log("[FALLBACK] Verifying checkout:", checkout_id);

    // 1. VERIFY payment with SumUp (NEVER trust frontend)
    const sumupRes = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!sumupRes.ok) return res.status(502).json({ error: "Could not verify payment" });
    const checkout = await sumupRes.json();

    if (checkout.status !== "PAID") {
      console.log("[FALLBACK] Not PAID. Status:", checkout.status);
      return res.status(200).json({ success: false, message: "Payment not completed" });
    }

    // 2. GET metadata (SumUp first, then frontend backup)
    let metadata = null;
    if (checkout.metadata && Object.keys(checkout.metadata).length > 0) {
      metadata = checkout.metadata;
      console.log("[FALLBACK] Using metadata from SumUp");
    } else if (frontendMetadata && Object.keys(frontendMetadata).length > 0) {
      metadata = frontendMetadata;
      console.log("[FALLBACK] Using metadata from Frontend");
    }

    if (!metadata || !metadata.date || !metadata.time) {
      console.error("[FALLBACK] No valid metadata for:", checkout_id);
      return res.status(400).json({ error: "Metadata not found" });
    }

    // 3. CREATE booking in Postgres
    try {
      await db`
        INSERT INTO bookings (tour_id, tour_name, customer_name, customer_email, customer_phone, passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang) 
        VALUES (
          ${metadata.tour || null},
          ${metadata.tourTitle || null},
          ${metadata.name || null},
          ${metadata.email || null},
          ${metadata.phone || null},
          ${metadata.qty || 1},
          ${metadata.date || null},
          ${metadata.time || null},
          ${metadata.total || 0},
          'PAID',
          ${checkout_id},
          ${metadata.lang || 'english'}
        )
      `;
      console.log("[FALLBACK] Saved to Postgres.");
    } catch (dbErr) {
      // Postgres unique violation code is 23505
      if (dbErr.code === '23505') {
        console.log("[FALLBACK] Duplicate entry in Postgres. Skipping insert.");
      } else {
        console.error("[FALLBACK] Postgres Error:", dbErr.message);
      }
    }

    // 4. CREATE booking in GAS (GAS deduplicates via sumup_checkout_id)
    const bookingData = { ...metadata, payment_status: "PAID", sumup_checkout_id: checkout_id };
    console.log("[FALLBACK] Sending to GAS:", JSON.stringify(bookingData));

    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createBooking", ...bookingData })
    });

    const gasResult = await gasResponse.text();
    console.log("[FALLBACK] GAS response:", gasResponse.status, gasResult);

    return res.status(200).json({ success: true, booking_created: true });

  } catch (error) {
    console.error("[FALLBACK] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
