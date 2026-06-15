/**
 * POST /api/gyg/bookings
 *
 * GYG calls this when a customer completes a booking on GYG.
 * We save to Postgres and trigger GAS (Google Calendar + confirmation email).
 *
 * Auth: HTTP Basic Auth (GYG_BASIC_USER / GYG_BASIC_PASS)
 */

import db from "../../lib/db.js";
import { validateGYGAuth, GYG_OPTION_TO_TOURS, GYG_OPTION_CONFIG } from "../../lib/gyg-config.js";

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    booking_id,       // GYG booking reference (e.g. "GYGABC123")
    option_id,        // GYG option ID (number)
    date,             // "YYYY-MM-DD"
    time,             // "HH:MM"
    participants,     // number
    customer,         // { first_name, last_name, email, phone, language }
    price,            // { amount, currency }
  } = req.body || {};

  // Validate required fields
  if (!booking_id || !option_id || !date || !time || !participants || !customer) {
    return res.status(400).json({ error: "Missing required booking fields" });
  }

  const optionId = parseInt(option_id);
  const cfg = GYG_OPTION_CONFIG[optionId];
  if (!cfg) {
    return res.status(404).json({ error: `Unknown option_id: ${optionId}` });
  }

  // Check vacancy before confirming
  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const [{ booked }] = await db`
    SELECT COALESCE(SUM(passengers), 0) as booked
    FROM bookings
    WHERE tour_id = ANY(${tourIds})
      AND booking_date = ${date}
      AND booking_time = ${time}
      AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
  `;

  const vacancies = cfg.maxPax - parseInt(booked);
  if (vacancies < participants) {
    return res.status(409).json({
      error: "Not enough vacancies",
      available: vacancies,
      requested: participants,
    });
  }

  // Use first matching internal tour ID for this option
  const tourId = tourIds[0] || `gyg-option-${optionId}`;
  const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  const lang = (customer.language || "english").toLowerCase();

  try {
    await db`
      INSERT INTO bookings (
        tour_id, tour_name, customer_name, customer_email, customer_phone,
        passengers, booking_date, booking_time, total_price, payment_status,
        lang, source, gyg_booking_id
      ) VALUES (
        ${tourId},
        ${`GYG Option ${optionId}`},
        ${customerName},
        ${customer.email || null},
        ${customer.phone || null},
        ${participants},
        ${date},
        ${time},
        ${price?.amount || 0},
        'PAID',
        ${lang},
        'gyg',
        ${booking_id}
      )
      ON CONFLICT (gyg_booking_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[GYG bookings] DB error:", err.message);
    return res.status(500).json({ error: "Failed to save booking" });
  }

  // Trigger GAS — Google Calendar event only (GYG sends their own confirmation email)
  const GAS_URL = process.env.GAS_URL;
  if (GAS_URL) {
    try {
      await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createCalendarOnly",
          tour: tourId,
          tourTitle: `GYG Option ${optionId}`,
          name: customerName,
          email: customer.email || "",
          phone: customer.phone || "",
          date,
          time,
          qty: participants,
          lang,
          total: price?.amount || 0,
          currency: price?.currency || "DKK",
          payment_status: "PAID",
          source: "gyg",
          gyg_booking_id: booking_id,
        }),
      });
    } catch (gasErr) {
      // Non-fatal — booking is already saved
      console.warn("[GYG bookings] GAS error:", gasErr.message);
    }
  }

  console.log(`[GYG bookings] Created: ${booking_id} | ${date} ${time} | ${participants}p`);

  return res.status(201).json({
    success: true,
    booking_id,
    status: "confirmed",
  });
}
