/**
 * gyg-notify.js
 * Shared helper — call this after any web booking is confirmed
 * to immediately push updated vacancies to GYG.
 *
 * GYG endpoint: POST https://supplier-api.getyourguide.com/1/notify-availability-update
 * Docs: https://integrator.getyourguide.com/documentation/gyg_endpoints
 */

import db from "./db.js";
import {
  GYG_OPTION_MAP,
  GYG_OPTION_CONFIG,
  GYG_OPTION_TO_TOURS,
  TOUR_CALENDAR,
  getBoatForTour,
  getTourDurationHours,
  getSlotsForOption,
  timeToMinutes,
} from "./gyg-config.js";
import { getBlocksByDate, isSlotBlocked } from "./blocked-slots.js";

const GYG_NOTIFY_URL = "https://supplier-api.getyourguide.com/1/notify-availability-update";

/**
 * Push updated availability to GYG for a given tour slot.
 * Call this immediately after saving a web booking to DB.
 *
 * @param {string} tourId     - internal tour ID (e.g. "city-highlights-1h")
 * @param {string} date       - "YYYY-MM-DD"
 * @param {string} time       - "HH:MM"
 */
export async function notifyGYGAvailability(tourId, date, time) {
  const user = process.env.GYG_GYG_USER;
  const pass = process.env.GYG_GYG_PASS;
  if (!user || !pass) {
    console.warn("[GYG notify] Missing GYG_GYG_USER / GYG_GYG_PASS — skipping");
    return;
  }

  const optionId = GYG_OPTION_MAP[tourId];
  if (!optionId) return; // tour not listed on GYG

  const cfg = GYG_OPTION_CONFIG[optionId];
  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];

  // Count total passengers booked for this slot (across all tours sharing the option)
  let vacancies;
  try {
    const [{ booked }] = await db`
      SELECT COALESCE(SUM(passengers), 0) AS booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date  = ${date}
        AND booking_time  = ${time}
        AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
    `;
    // Exclusive-slot model: 1 group per time slot (maxGroups), same logic as
    // handleAvailability in gyg-handler.js — any passenger booked means the slot is taken.
    vacancies = parseInt(booked) > 0 ? 0 : (cfg.maxGroups ?? 1);
  } catch (err) {
    console.warn("[GYG notify] DB error reading vacancies:", err.message);
    return;
  }

  // Un bloqueo manual del bote pisa cualquier cálculo de plazas
  if (vacancies > 0) {
    try {
      const boat = getBoatForTour(tourId);
      const startMin = timeToMinutes(time);
      const blocks = await getBlocksByDate(boat, date, date);
      if (isSlotBlocked(blocks, date, startMin, startMin + getTourDurationHours(tourId) * 60)) {
        vacancies = 0;
      }
    } catch (err) {
      console.warn("[GYG notify] Block check error:", err.message);
    }
  }

  // Build ISO dateTime with correct Copenhagen offset (DST-aware)
  const slotDate = new Date(`${date}T${time}:00`);
  const offset = isCopenhagnDST(slotDate) ? "+02:00" : "+01:00";
  const dateTime = `${date}T${time}:00${offset}`;

  const payload = {
    data: {
      productId: tourId,
      availabilities: [{ dateTime, vacancies }],
    },
  };

  try {
    const basicAuth = Buffer.from(`${user}:${pass}`).toString("base64");
    const res = await fetch(GYG_NOTIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 202) {
      console.log(`[GYG notify] ✅ option=${optionId} ${dateTime} vacancies=${vacancies}`);
    } else {
      const body = await res.text();
      console.warn(`[GYG notify] ⚠️ status=${res.status} body=${body}`);
    }
  } catch (err) {
    // Non-fatal — the web booking is already saved in DB.
    // GYG will pick up the change on their next scheduled availability pull.
    console.warn("[GYG notify] Fetch error:", err.message);
  }
}

/**
 * Empuja a GYG la disponibilidad de TODOS los slots afectados por un bloqueo
 * (o desbloqueo) de un bote en un rango de fechas/horas.
 * Sin esto, GYG sigue sirviendo su caché hasta su próximo pull programado.
 *
 * @param {string} boat       'boat1' | 'boat2'
 * @param {string} dateFrom   "YYYY-MM-DD"
 * @param {string} dateTo     "YYYY-MM-DD"
 * @param {string} startTime  "HH:MM"
 * @param {string} endTime    "HH:MM"
 */
export async function notifyGYGBoatRange(boat, dateFrom, dateTo, startTime, endTime) {
  const boatTours = Object.keys(TOUR_CALENDAR).filter(t => TOUR_CALENDAR[t] === boat);
  const blockStart = timeToMinutes(startTime);
  const blockEnd = timeToMinutes(endTime);

  // Un solo tour representativo por optionId — GYG razona por producto, no por tour
  const seenOptions = new Set();
  const targets = [];
  for (const tourId of boatTours) {
    const optionId = GYG_OPTION_MAP[tourId];
    if (!optionId || seenOptions.has(optionId)) continue;
    seenOptions.add(optionId);
    targets.push({ tourId, optionId });
  }

  for (let date = dateFrom; date <= dateTo; date = incrementDate(date)) {
    for (const { tourId, optionId } of targets) {
      const durationMin = getTourDurationHours(tourId) * 60;
      for (const time of getSlotsForOption(optionId)) {
        const slotStart = timeToMinutes(time);
        if (slotStart >= blockEnd || slotStart + durationMin <= blockStart) continue;
        await notifyGYGAvailability(tourId, date, time);
      }
    }
  }
}

function incrementDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

// ── DST helpers (same logic as gyg-handler.js) ──────────────────────────────

function isCopenhagnDST(date) {
  const year = date.getFullYear();
  const dstStart = lastSundayOf(year, 2); // last Sunday of March
  dstStart.setHours(2, 0, 0, 0);
  const dstEnd = lastSundayOf(year, 9);   // last Sunday of October
  dstEnd.setHours(3, 0, 0, 0);
  return date >= dstStart && date < dstEnd;
}

function lastSundayOf(year, month) {
  const d = new Date(year, month + 1, 0); // last day of month
  d.setDate(d.getDate() - d.getDay());    // back to Sunday
  return d;
}
