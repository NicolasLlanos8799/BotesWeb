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

import crypto from "crypto";
import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import {
  validateGYGAuth,
  GYG_OPTION_CONFIG,
  GYG_OPTION_TO_TOURS,
  GYG_OPTION_MAP,
  BLOCKED_DATES,
  getSlotsForOption,
} from "../lib/gyg-config.js";

// ── GAS helper ────────────────────────────────────────────────────────────────
// Awaited call to Google Apps Script to sync Google Calendar. MUST be awaited:
// on Vercel the lambda freezes once the response is sent and a pending fetch dies.
// Non-fatal: errors are swallowed, the booking is already safe in the DB.
function callGAS(payload) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return Promise.resolve();
  return fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(e => warn("[GYG→GAS] Error:", e.message));
}

// Price per group/vehicle per GYG option ID (in DKK øre = DKK * 100)
const OPTION_PRICES = {
  1288168: 249900,  // City Highlights 1h — 2499 DKK
  1919949: 579900,  // City Highlights 10p — 5799 DKK (verified in Supplier Portal — was wrong at 2999)
  1288188: 429900,  // Harbor Extended — 4299 DKK
  1825099: 899900,  // Land Tour — 8999 DKK
  1935449: 999900,  // Copenhagen to Malmö — 9999 DKK
  1826872: 549900,  // Wine Tour — 5499 DKK (corrected 2026-08-04, was wrong at 5799)
  1288216: 599900,  // Sea Fortress and Coastal Journey (4h) — 5999 DKK
};

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(200).json({ errorCode: "AUTHORIZATION_FAILURE", errorMessage: "Unauthorized" });
  }

  const url = req.url || "";
  const method = req.method;

  log(`[GYG] ${method} ${url}`);

  try {
    if (method === "GET" && url.includes("get-availabilities")) {
      return await handleAvailability(req, res);
    }
    if (method === "POST" && url.includes("/reserve/")) {
      return await handleReserve(req, res);
    }
    if (method === "POST" && url.includes("/book/")) {
      return await handleBook(req, res);
    }
    if (method === "POST" && url.includes("cancel-reservation")) {
      return await handleCancelReservation(req, res);
    }
    if (method === "POST" && url.includes("cancel-booking")) {
      return await handleCancelBooking(req, res);
    }

    log(`[GYG] Unmatched: ${method} ${url}`);
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: `Unknown endpoint: ${method} ${url}` });
  } catch (err) {
    logError(`[GYG] Unhandled error in ${method} ${url}:`, err);
    return res.status(200).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }
}

/* ─── AVAILABILITY ─────────────────────────────────────────── */

async function handleAvailability(req, res) {
  const { productId, fromDateTime, toDateTime } = req.query;

  if (!productId || !fromDateTime || !toDateTime) {
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing productId, fromDateTime or toDateTime" });
  }

  // Find which GYG option this productId maps to
  const { optionId, cfg } = getOptionForProduct(productId);
  if (!cfg) {
    return res.status(200).json({ errorCode: "INVALID_PRODUCT", errorMessage: `Unknown productId: ${productId}` });
  }

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const slots = getSlotsForOption(optionId);
  // Extract local Copenhagen date directly from ISO string (avoid UTC conversion bug)
  const dateFrom = fromDateTime.split("T")[0];
  const dateTo = toDateTime.split("T")[0];

  try {
    const result = tourIds.length > 0 ? await db`
      SELECT booking_date, booking_time, SUM(passengers) as booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date BETWEEN ${dateFrom} AND ${dateTo}
        AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY booking_date, booking_time
    ` : { rows: [] };
    const bookings = result.rows ?? result;

    const bookedMap = {};
    for (const row of bookings) {
      // booking_date may be a Date object from Neon
      const dateKey = row.booking_date instanceof Date
        ? row.booking_date.toISOString().split("T")[0]
        : String(row.booking_date).split("T")[0];
      const timeKey = row.booking_time.slice(0, 5);
      bookedMap[`${dateKey}_${timeKey}`] = parseInt(row.booked);
    }

    const availabilities = [];
    // Iterate over local Copenhagen dates using string comparison
    for (let dateStr = dateFrom; dateStr <= dateTo; dateStr = incrementDate(dateStr)) {
      for (const time of slots) {
        const booked = bookedMap[`${dateStr}_${time}`] || 0;
        const vacancies = (BLOCKED_DATES.includes(dateStr) || booked > 0) ? 0 : (cfg.maxGroups ?? 1); // 1 group slot per time point
        const d = new Date(dateStr + "T12:00:00Z"); // noon UTC for DST check
        const offset = isCopenhagnDST(d) ? "+02:00" : "+01:00";
        const dateTime = `${dateStr}T${time}:00${offset}`;

        availabilities.push({
          productId,
          dateTime,
          vacancies,
          cutoffSeconds: 7200, // 2h cutoff
          currency: "DKK",
          pricesByCategory: {
            retailPrices: [
              { category: "GROUP", price: OPTION_PRICES[optionId] || 249900 },
            ],
          },
        });
      }
    }

    return res.status(200).json({ data: { availabilities } });

  } catch (err) {
    logError("[GYG availability] Error:", err.message);
    return res.status(200).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }
}

/* ─── RESERVE (temporary hold) ─────────────────────────────── */

async function handleReserve(req, res) {
  const { data } = req.body || {};
  if (!data?.productId || !data?.dateTime || !data?.bookingItems || !data?.gygBookingReference) {
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing required fields" });
  }

  const { optionId, cfg } = getOptionForProduct(data.productId);
  if (!cfg) {
    return res.status(200).json({ errorCode: "INVALID_PRODUCT", errorMessage: `Unknown productId: ${data.productId}` });
  }

  // Validate ticket categories — all our products are group-priced (GROUP only)
  const invalidItem = data.bookingItems.find(item => item.category !== "GROUP");
  if (invalidItem) {
    return res.status(200).json({
      errorCode: "INVALID_TICKET_CATEGORY",
      errorMessage: `Ticket category ${invalidItem.category} is not supported. Only GROUP tickets are available.`,
      ticketCategory: invalidItem.category,
    });
  }

  // Validate participant count against the option's real capacity (maxPax)
  const maxParticipants = cfg.maxPax;
  const oversizedItem = data.bookingItems.find(item => (item.groupSize ?? 0) > maxParticipants);
  if (oversizedItem) {
    return res.status(200).json({
      errorCode: "INVALID_PARTICIPANTS_CONFIGURATION",
      errorMessage: `The activity can only be booked for up to ${maxParticipants} participants.`,
      participantsConfiguration: { min: 1, max: maxParticipants },
      groupConfiguration: { max: 1 },
    });
  }

  // GROUP tickets carry real pax in groupSize; count is the number of groups (1)
  const participants = data.bookingItems.reduce((sum, item) => sum + (item.groupSize || item.count || 0), 0);
  // Extract local Copenhagen date/time directly from ISO string to avoid UTC conversion
  const [date, rawTime] = data.dateTime.split("T");
  const time = rawTime.slice(0, 5); // "17:00"

  if (BLOCKED_DATES.includes(date)) {
    return res.status(200).json({ errorCode: "NO_AVAILABILITY", errorMessage: `No vacancies: slot is fully booked` });
  }

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const reserveResult = await db`
    SELECT COALESCE(SUM(passengers), 0) as booked
    FROM bookings
    WHERE tour_id = ANY(${tourIds})
      AND booking_date = ${date}
      AND booking_time = ${time}
      AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
  `;
  const [{ booked }] = reserveResult.rows ?? reserveResult;

  const maxGroups = cfg.maxGroups ?? 1;
  if (parseInt(booked) >= maxGroups) {
    return res.status(200).json({ errorCode: "NO_AVAILABILITY", errorMessage: `No vacancies: slot is fully booked` });
  }

  // Save as RESERVED (temporary hold — GYG will confirm with /book/)
  // Amendment flow: GYG reuses the same gygBookingReference with new date/pax to change
  // an existing booking — so on conflict we UPDATE the slot instead of ignoring the call.
  const tourId = tourIds[0] || `gyg-option-${optionId}`;
  const reservationReference = `RES-${crypto.randomUUID()}`;
  try {
    await db`
      INSERT INTO bookings (
        tour_id, tour_name, passengers, booking_date, booking_time,
        total_price, payment_status, lang, source, gyg_booking_id
      ) VALUES (
        ${tourId}, ${`GYG Option ${optionId}`}, ${participants},
        ${date}, ${time}, 0, 'RESERVED', 'english', 'gyg', ${data.gygBookingReference}
      )
      ON CONFLICT (gyg_booking_id) DO UPDATE
        SET booking_date = ${date}, booking_time = ${time},
            passengers = ${participants}, payment_status = 'RESERVED'
    `;
  } catch (err) {
    logError("[GYG reserve] DB error:", err.message);
    return res.status(200).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }

  // Block slot in Google Calendar immediately (grey HOLD event)
  await callGAS({
    action: "createHoldEvent",
    gyg_booking_id: data.gygBookingReference,
    tour: tourId,
    calendar: "boat1",
    date,
    time,
    qty: participants,
  });

  return res.status(200).json({
    data: {
      reservationReference,
      reservationExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    },
  });
}

/* ─── BOOK (confirm reservation) ───────────────────────────── */

async function handleBook(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  const { optionId: bookOptionId, cfg: bookCfg } = data.productId ? getOptionForProduct(data.productId) : {};
  // Only validate pax if we can resolve the product — /book/ doesn't require productId
  // and participant validation already happened in /reserve/
  if (bookCfg?.maxPax) {
    const oversizedItem = (data.bookingItems || []).find(item => (item.groupSize ?? 0) > bookCfg.maxPax);
    if (oversizedItem) {
      return res.status(200).json({
        errorCode: "INVALID_PARTICIPANTS_CONFIGURATION",
        errorMessage: `The activity can only be booked for up to ${bookCfg.maxPax} participants.`,
        participantsConfiguration: { min: 1, max: bookCfg.maxPax },
        groupConfiguration: { max: 1 },
      });
    }
  }

  try {
    // GYG sends travelers[], not customer{}
    const traveler = data.travelers?.[0] || {};
    const customerName = [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || null;
    const customerEmail = traveler.email || null;
    const customerPhone = traveler.phoneNumber || null;
    const customerLang = (traveler.language || "english").toLowerCase();

    const result = await db`
      UPDATE bookings
      SET payment_status = 'PAID',
          customer_name  = ${customerName},
          customer_email = ${customerEmail},
          customer_phone = ${customerPhone},
          lang           = ${customerLang}
      WHERE gyg_booking_id = ${data.gygBookingReference}
      RETURNING *
    `;

    let rows = result.rows ?? result;

    // If no prior reservation, insert directly (GYG test groups run independently)
    if (rows.length === 0) {
      const dateTime = new Date(data.dateTime || Date.now());
      const date = dateTime.toISOString().split("T")[0];
      const time = `${String(dateTime.getHours()).padStart(2, "0")}:${String(dateTime.getMinutes()).padStart(2, "0")}`;
      const participants = (data.bookingItems || []).reduce((s, i) => s + (i.groupSize || i.count || 0), 0);
      const inserted = await db`
        INSERT INTO bookings (
          tour_id, tour_name, passengers, booking_date, booking_time,
          total_price, payment_status, lang, source, gyg_booking_id,
          customer_name, customer_email, customer_phone
        ) VALUES (
          ${data.productId || "gyg"}, ${"GYG Direct Book"}, ${participants},
          ${date}, ${time}, 0, 'PAID', ${customerLang}, 'gyg', ${data.gygBookingReference},
          ${customerName}, ${customerEmail}, ${customerPhone}
        )
        ON CONFLICT (gyg_booking_id) DO UPDATE
          SET payment_status = 'PAID', customer_name = ${customerName},
              customer_email = ${customerEmail}, customer_phone = ${customerPhone},
              lang = ${customerLang}
        RETURNING *
      `;
      rows = inserted.rows ?? inserted;
    }

    const booking = rows[0];

    // Upgrade HOLD → confirmed CYAN event in Google Calendar
    const bookingDate = booking.booking_date instanceof Date
      ? booking.booking_date.toISOString().split("T")[0]
      : booking.booking_date;
    const bookingTime = booking.booking_time?.slice(0, 5);

    // GYG does not send productId on /book/ — fall back to the stored tour_id
    const effectiveOptionId = bookOptionId ?? getOptionForProduct(booking.tour_id).optionId;
    const optionPrice = OPTION_PRICES[effectiveOptionId];

    if (optionPrice != null && !(booking.total_price > 0)) {
      await db`UPDATE bookings SET total_price = ${optionPrice / 100} WHERE gyg_booking_id = ${data.gygBookingReference}`;
      booking.total_price = optionPrice / 100;
    }

    await callGAS({
      action: "confirmHoldEvent",
      gyg_booking_id: data.gygBookingReference,
      tour: booking.tour_id,
      calendar: "boat1",
      date: bookingDate,
      time: bookingTime,
      qty: booking.passengers,
      lang: customerLang,
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      amount: optionPrice != null ? optionPrice / 100 : null,
      currency: "DKK",
      source: "GetYourGuide",
    });

    // Build tickets array — one ticket per participant per category
    const tickets = (data.bookingItems || []).flatMap(item =>
      Array.from({ length: item.count || 0 }, (_, i) => ({
        category: item.category,
        ticketCode: `${data.gygBookingReference}-${item.category}-${i + 1}`,
        ticketCodeType: "TEXT",
      }))
    );

    const bookingReference = `BOOK-${crypto.randomUUID()}`;
    log(`[GYG book] Confirmed: ${data.gygBookingReference} | bookingReference: ${bookingReference} | tickets: ${tickets.length}`);
    return res.status(200).json({
      data: {
        bookingReference,
        tickets,
      },
    });

  } catch (err) {
    logError("[GYG book] Error:", err.message);
    return res.status(200).json({ errorCode: "INTERNAL_SYSTEM_FAILURE", errorMessage: err.message });
  }
}

/* ─── CANCEL RESERVATION ───────────────────────────────────── */

async function handleCancelReservation(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  await db`
    UPDATE bookings SET payment_status = 'CANCELLED'
    WHERE gyg_booking_id = ${data.gygBookingReference}
    AND payment_status = 'RESERVED'
  `;

  // Remove HOLD event from Google Calendar — slot is free again
  await callGAS({ action: "deleteHoldEvent", gyg_booking_id: data.gygBookingReference });

  return res.status(200).json({ data: { status: "cancelled" } });
}

/* ─── CANCEL BOOKING ───────────────────────────────────────── */

async function handleCancelBooking(req, res) {
  const { data } = req.body || {};
  if (!data?.gygBookingReference) {
    return res.status(200).json({ errorCode: "VALIDATION_FAILURE", errorMessage: "Missing gygBookingReference" });
  }

  await db`
    UPDATE bookings SET payment_status = 'CANCELLED'
    WHERE gyg_booking_id = ${data.gygBookingReference}
  `;

  // Remove confirmed event from Google Calendar — slot is free again
  await callGAS({ action: "deleteHoldEvent", gyg_booking_id: data.gygBookingReference });

  log(`[GYG cancel] Cancelled: ${data.gygBookingReference}`);
  return res.status(200).json({ data: { status: "cancelled" } });
}

/* ─── HELPERS ──────────────────────────────────────────────── */

function getOptionForProduct(productId) {
  // productId is our internal tour ID (e.g. "city-highlights-1h")
  // Find which GYG option it belongs to
  for (const [optionId, tourIds] of Object.entries(GYG_OPTION_TO_TOURS)) {
    if (tourIds.includes(productId)) {
      return { optionId: parseInt(optionId), cfg: GYG_OPTION_CONFIG[optionId] };
    }
  }
  return { optionId: null, cfg: null };
}

/**
 * Returns true if the given date falls within Copenhagen DST (CEST = +02:00).
 * DST in Denmark: last Sunday of March → last Sunday of October.
 */
function isCopenhagnDST(date) {
  const year = date.getFullYear();
  // Last Sunday of March
  const dstStart = lastSundayOf(year, 2); // month 2 = March (0-indexed)
  dstStart.setHours(2, 0, 0, 0);
  // Last Sunday of October
  const dstEnd = lastSundayOf(year, 9); // month 9 = October
  dstEnd.setHours(3, 0, 0, 0);
  return date >= dstStart && date < dstEnd;
}

function incrementDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

function lastSundayOf(year, month) {
  const d = new Date(year, month + 1, 0); // last day of month
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d;
}
// gyg-handler v3
