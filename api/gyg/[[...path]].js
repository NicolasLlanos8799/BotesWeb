/**
 * /api/gyg — GYG Supplier API (all sub-paths rewritten here via vercel.json)
 *
 * GYG calls:
 *   GET  /api/gyg/1/get-availabilities/     → availability query
 *   POST /api/gyg/1/reserve/                → temporary hold
 *   POST /api/gyg/1/book/                   → confirm booking
 *   POST /api/gyg/1/cancel-reservation/     → cancel hold
 *   POST /api/gyg/1/cancel-booking/         → cancel confirmed booking
 *
 * Auth: HTTP Basic Auth (GYG_BASIC_USER / GYG_BASIC_PASS)
 */

import db from "../../lib/db.js";
import {
  validateGYGAuth,
  GYG_OPTION_CONFIG,
  GYG_OPTION_TO_TOURS,
  getSlotsForOption,
} from "../../lib/gyg-config.js";

// Price per adult per GYG option ID (in DKK øre = DKK * 100)
const OPTION_PRICES = {
  1288168: 249900,  // City Highlights 1h — 2499 DKK
  1919949: 299900,  // City Highlights 10p — 2999 DKK
  1288188: 429900,  // Harbor Extended — 4299 DKK
  1825099: 899900,  // Land Tour — 8999 DKK
  1935449: 1300000, // Copenhagen to Malmö — 13000 DKK
  1826872: 349900,  // Wine Tour — 3499 DKK
};

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(401).json({ errorCode: "AUTHORIZATION_FAILURE", errorMessage: "Unauthorized" });
  }

  const url = req.url || "";
  const method = req.method;

  console.log(`[GYG] ${method} ${url}`);

  if (method === "GET" && url.includes("get-availabilities")) {
    return handleAvailability(req, res);
  }
  if (method === "POST" && url.includes("/reserve/")) {
    return handleReserve(req, res);
  }
  if (method === "POST" && url.includes("/book/")) {
    return handleBook(req, res);
  }
  if (method === "POST" && url.includes("cancel-reservation")) {
    return handleCancelReservation(req, res);
  }
  if (method === "POST" && url.includes("cancel-booking")) {
    return handleCancelBooking(req, res);
  }

  console.log(`[GYG] Unmatched: ${method} ${url}`);
  return res.status(404).json({ errorCode: "VALIDATION_FAILURE", errorMessage: `Unknown endpoint: ${method} ${url}` });
}

/* ─── AVAILABILITY ─────────────────────────────────────────── */

async function handleAvailability(req, res) {
  const { productId, fromDateTime, toDateTime } = req.query;

  if (!productId || !fromDateTime || !toDateTime) {
    return res.status(400).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing productId, fromDateTime or toDateTime" });
  }

  // Find which GYG option this productId maps to
  const { optionId, cfg } = getOptionForProduct(productId);
  if (!cfg) {
    return res.status(400).json({ errorCode: "INVALID_PRODUCT", errorMessage: `Unknown productId: ${productId}` });
  }

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const slots = getSlotsForOption(optionId);
  const from = new Date(fromDateTime);
  const to = new Date(toDateTime);
  const dateFrom = from.toISOString().split("T")[0];
  const dateTo = to.toISOString().split("T")[0];

  try {
    const bookings = await db`
      SELECT booking_date, booking_time, SUM(passengers) as booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date BETWEEN ${dateFrom} AND ${dateTo}
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
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      for (const time of slots) {
        const booked = bookedMap[`${dateStr}_${time}`] || 0;
        const vacancies = Math.max(0, cfg.maxPax - booked);
        const [h, m] = time.split(":");
        const dateTime = `${dateStr}T${time}:00+02:00`; // Copenhagen timezone (CEST)

        availabilities.push({
          productId,
          dateTime,
          vacancies,
          cutoffSeconds: 7200, // 2h cutoff
          currency: "DKK",
          pricesByCategory: {
            retailPrices: [
              { category: "ADULT", price: OPTION_PRICES[optionId] || 249900 },
            ],
          },
        });
      }
    }

    return res.status(200).json({ data: { availabilities } });

  } catch (err) {
    console.error("[GYG availability] Error:", err.message);
    return res.status(500).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }
}

/* ─── RESERVE (temporary hold) ─────────────────────────────── */

async function handleReserve(req, res) {
  const { data } = req.body || {};
  if (!data?.productId || !data?.dateTime || !data?.bookingItems || !data?.gygBookingReference) {
    return res.status(400).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing required fields" });
  }

  const { optionId, cfg } = getOptionForProduct(data.productId);
  if (!cfg) {
    return res.status(400).json({ errorCode: "INVALID_PRODUCT", errorMessage: `Unknown productId: ${data.productId}` });
  }

  const participants = data.bookingItems.reduce((sum, item) => sum + (item.count || 0), 0);
  const dateTime = new Date(data.dateTime);
  const date = dateTime.toISOString().split("T")[0];
  const time = `${String(dateTime.getHours()).padStart(2, "0")}:${String(dateTime.getMinutes()).padStart(2, "0")}`;

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
    return res.status(409).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Not enough vacancies" });
  }

  // Save as RESERVED (temporary hold — GYG will confirm with /book/)
  const tourId = tourIds[0] || `gyg-option-${optionId}`;
  try {
    await db`
      INSERT INTO bookings (
        tour_id, tour_name, passengers, booking_date, booking_time,
        total_price, payment_status, lang, source, gyg_booking_id
      ) VALUES (
        ${tourId}, ${`GYG Option ${optionId}`}, ${participants},
        ${date}, ${time}, 0, 'RESERVED', 'english', 'gyg', ${data.gygBookingReference}
      )
      ON CONFLICT (gyg_booking_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[GYG reserve] DB error:", err.message);
    return res.status(500).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }

  return res.status(200).json({
    data: {
      reservationId: data.gygBookingReference,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h expiry
    },
  });
}

/* ─── BOOK (confirm reservation) ───────────────────────────── */

async function handleBook(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(400).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  try {
    const result = await db`
      UPDATE bookings
      SET payment_status = 'PAID',
          customer_name  = ${data.customer?.firstName + " " + (data.customer?.lastName || "") || null},
          customer_email = ${data.customer?.email || null},
          customer_phone = ${data.customer?.phone || null},
          lang           = ${(data.customer?.language || "english").toLowerCase()}
      WHERE gyg_booking_id = ${data.gygBookingReference}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Reservation not found" });
    }

    const booking = result[0];

    // Trigger GAS — Calendar only, no email
    const GAS_URL = process.env.GAS_URL;
    if (GAS_URL) {
      fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createCalendarOnly",
          tour: booking.tour_id,
          name: booking.customer_name,
          email: booking.customer_email,
          phone: booking.customer_phone,
          date: booking.booking_date,
          time: booking.booking_time,
          qty: booking.passengers,
          lang: booking.lang,
          gyg_booking_id: data.gygBookingReference,
          source: "gyg",
        }),
      }).catch(e => console.warn("[GYG book] GAS error:", e.message));
    }

    console.log(`[GYG book] Confirmed: ${data.gygBookingReference}`);
    return res.status(200).json({ data: { bookingId: data.gygBookingReference, status: "confirmed" } });

  } catch (err) {
    console.error("[GYG book] Error:", err.message);
    return res.status(500).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }
}

/* ─── CANCEL RESERVATION ───────────────────────────────────── */

async function handleCancelReservation(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(400).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  await db`
    UPDATE bookings SET payment_status = 'CANCELLED'
    WHERE gyg_booking_id = ${data.gygBookingReference}
    AND payment_status = 'RESERVED'
  `;

  return res.status(200).json({ data: { status: "cancelled" } });
}

/* ─── CANCEL BOOKING ───────────────────────────────────────── */

async function handleCancelBooking(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(400).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  await db`
    UPDATE bookings SET payment_status = 'CANCELLED'
    WHERE gyg_booking_id = ${data.gygBookingReference}
  `;

  console.log(`[GYG cancel] Cancelled: ${data.gygBookingReference}`);
  return res.status(200).json({ data: { status: "cancelled" } });
}

/* ─── HELPERS ──────────────────────────────────────────────── */

function getOptionForProduct(productId) {
  // productId is our internal tour ID (e.g. "book-1h")
  // Find which GYG option it belongs to
  for (const [optionId, tourIds] of Object.entries(GYG_OPTION_TO_TOURS)) {
    if (tourIds.includes(productId)) {
      return { optionId: parseInt(optionId), cfg: GYG_OPTION_CONFIG[optionId] };
    }
  }
  return { optionId: null, cfg: null };
}
