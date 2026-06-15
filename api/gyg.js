/**
 * /api/gyg — Single entry point for all GYG Supplier API endpoints
 *
 * Routes:
 *   GET  /api/gyg?action=availability  → check available slots
 *   POST /api/gyg?action=bookings      → create booking from GYG
 *   POST /api/gyg?action=cancel        → cancel booking from GYG
 *
 * Auth: HTTP Basic Auth (GYG_BASIC_USER / GYG_BASIC_PASS)
 */

import db from "../lib/db.js";
import {
  validateGYGAuth,
  GYG_OPTION_CONFIG,
  GYG_OPTION_TO_TOURS,
  getSlotsForOption,
} from "../lib/gyg-config.js";

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const action = req.query.action;

  if (req.method === "GET" && action === "availability") {
    return handleAvailability(req, res);
  }
  if (req.method === "POST" && action === "bookings") {
    return handleBookings(req, res);
  }
  if (req.method === "POST" && action === "cancel") {
    return handleCancel(req, res);
  }

  return res.status(404).json({ error: `Unknown action: ${action}` });
}

/* ─── AVAILABILITY ─────────────────────────────────────────── */

async function handleAvailability(req, res) {
  const { option_id, date_from, date_to } = req.query;

  if (!option_id || !date_from || !date_to) {
    return res.status(400).json({ error: "Missing required params: option_id, date_from, date_to" });
  }

  const optionId = parseInt(option_id);
  const cfg = GYG_OPTION_CONFIG[optionId];
  if (!cfg) return res.status(404).json({ error: `Unknown option_id: ${optionId}` });

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const slots = getSlotsForOption(optionId);

  try {
    const bookings = await db`
      SELECT booking_date, booking_time, SUM(passengers) as booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date BETWEEN ${date_from} AND ${date_to}
        AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY booking_date, booking_time
    `;

    const bookedMap = {};
    for (const row of bookings) {
      const dateKey = row.booking_date.toISOString().split("T")[0];
      const timeKey = row.booking_time.slice(0, 5);
      bookedMap[`${dateKey}_${timeKey}`] = parseInt(row.booked);
    }

    const availabilities = [];
    const to = new Date(date_to);
    for (let d = new Date(date_from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      for (const time of slots) {
        const booked = bookedMap[`${dateStr}_${time}`] || 0;
        const vacancies = Math.max(0, cfg.maxPax - booked);
        availabilities.push({ date: dateStr, time, option_id: optionId, vacancies, available: vacancies > 0 });
      }
    }

    return res.status(200).json({ availabilities });
  } catch (err) {
    console.error("[GYG availability] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/* ─── BOOKINGS ─────────────────────────────────────────────── */

async function handleBookings(req, res) {
  const { booking_id, option_id, date, time, participants, customer, price } = req.body || {};

  if (!booking_id || !option_id || !date || !time || !participants || !customer) {
    return res.status(400).json({ error: "Missing required booking fields" });
  }

  const optionId = parseInt(option_id);
  const cfg = GYG_OPTION_CONFIG[optionId];
  if (!cfg) return res.status(404).json({ error: `Unknown option_id: ${optionId}` });

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const [{ booked }] = await db`
    SELECT COALESCE(SUM(passengers), 0) as booked
    FROM bookings
    WHERE tour_id = ANY(${tourIds})
      AND booking_date = ${date}
      AND booking_time = ${time}
      AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
  `;

  if (cfg.maxPax - parseInt(booked) < participants) {
    return res.status(409).json({ error: "Not enough vacancies" });
  }

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
        ${tourId}, ${`GYG Option ${optionId}`}, ${customerName},
        ${customer.email || null}, ${customer.phone || null},
        ${participants}, ${date}, ${time}, ${price?.amount || 0},
        'PAID', ${lang}, 'gyg', ${booking_id}
      )
      ON CONFLICT (gyg_booking_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[GYG bookings] DB error:", err.message);
    return res.status(500).json({ error: "Failed to save booking" });
  }

  const GAS_URL = process.env.GAS_URL;
  if (GAS_URL) {
    fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createCalendarOnly",
        tour: tourId, tourTitle: `GYG Option ${optionId}`,
        name: customerName, email: customer.email || "", phone: customer.phone || "",
        date, time, qty: participants, lang,
        total: price?.amount || 0, currency: price?.currency || "DKK",
        payment_status: "PAID", source: "gyg", gyg_booking_id: booking_id,
      }),
    }).catch(e => console.warn("[GYG bookings] GAS error:", e.message));
  }

  console.log(`[GYG bookings] Created: ${booking_id} | ${date} ${time} | ${participants}p`);
  return res.status(201).json({ success: true, booking_id, status: "confirmed" });
}

/* ─── CANCEL ───────────────────────────────────────────────── */

async function handleCancel(req, res) {
  const { booking_id } = req.body || {};
  if (!booking_id) return res.status(400).json({ error: "Missing booking_id" });

  try {
    const result = await db`
      UPDATE bookings SET payment_status = 'CANCELLED'
      WHERE gyg_booking_id = ${booking_id}
      RETURNING id
    `;
    if (result.length === 0) {
      return res.status(200).json({ success: true, note: "Booking not found, no-op" });
    }
    console.log(`[GYG cancel] Cancelled: ${booking_id}`);
    return res.status(200).json({ success: true, booking_id });
  } catch (err) {
    console.error("[GYG cancel] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
