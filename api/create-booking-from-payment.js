import db from "../lib/db.js";
import { GYG_OPTION_MAP, GYG_OPTION_TO_TOURS, GYG_OPTION_CONFIG } from "../lib/gyg-config.js";

/**
 * Notify GYG that availability has changed for a given tour/date/time.
 * Called after a web booking is confirmed so GYG blocks the slot if sold out.
 */
async function notifyGYGAvailability(tourId, date, time, passengersBooked) {
  const GYG_GYG_USER = process.env.GYG_GYG_USER;
  const GYG_GYG_PASS = process.env.GYG_GYG_PASS;
  if (!GYG_GYG_USER || !GYG_GYG_PASS) return;

  const optionId = GYG_OPTION_MAP[tourId];
  if (!optionId) return; // tour not on GYG

  const cfg = GYG_OPTION_CONFIG[optionId];
  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];

  // Count total booked for this slot across all tours sharing the option
  try {
    const [{ booked }] = await db`
      SELECT COALESCE(SUM(passengers), 0) as booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date = ${date}
        AND booking_time = ${time}
        AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
    `;
    const vacancies = Math.max(0, cfg.maxPax - parseInt(booked));

    const basicAuth = Buffer.from(`${GYG_GYG_USER}:${GYG_GYG_PASS}`).toString("base64");
    await fetch("https://api.getyourguide.com/supplier/v1/notify-availability", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        option_id: optionId,
        date,
        time,
        vacancies,
      }),
    });
    console.log(`[GYG notify] option=${optionId} ${date} ${time} vacancies=${vacancies}`);
  } catch (err) {
    // Non-fatal — web booking is already saved
    console.warn("[GYG notify] Failed:", err.message);
  }
}

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

    // 3. SAVE to Postgres (idempotent — ON CONFLICT DO NOTHING)
    try {
      await db`
        INSERT INTO bookings (
          tour_id, tour_name, customer_name, customer_email, customer_phone,
          passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang
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
          ${metadata.lang || 'english'}
        )
        ON CONFLICT (sumup_id) DO UPDATE SET payment_status = 'PAID'
      `;
      console.log("[FALLBACK] Saved to Postgres.");
    } catch (dbErr) {
      if (dbErr.code === '23505') {
        console.log("[FALLBACK] Duplicate in Postgres, skipping insert.");
      } else {
        console.error("[FALLBACK] Postgres error:", dbErr.message);
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
    console.log("[FALLBACK] Sending to GAS:", JSON.stringify(bookingData));

    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createBooking", ...bookingData })
    });

    const gasResult = await gasResponse.text();
    console.log("[FALLBACK] GAS response:", gasResponse.status, gasResult);

    // 5. NOTIFY GYG — block the slot if sold out
    await notifyGYGAvailability(metadata.tour, metadata.date, metadata.time, metadata.qty || 1);

    return res.status(200).json({ success: true, booking_created: true });

  } catch (error) {
    console.error("[FALLBACK] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
