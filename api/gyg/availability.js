/**
 * GET /api/gyg/availability
 *
 * GYG calls this endpoint to fetch available slots for a product option.
 * Query params: option_id, date_from, date_to
 *
 * Auth: HTTP Basic Auth (GYG_BASIC_USER / GYG_BASIC_PASS)
 *
 * Response format follows GYG Supplier API spec:
 * https://integrator.getyourguide.com/documentation/supplier_endpoints#tag/Availability
 */

import db from "../../lib/db.js";
import { validateGYGAuth, GYG_OPTION_CONFIG, GYG_OPTION_TO_TOURS, getSlotsForOption } from "../../lib/gyg-config.js";

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { option_id, date_from, date_to } = req.query;

  if (!option_id || !date_from || !date_to) {
    return res.status(400).json({ error: "Missing required params: option_id, date_from, date_to" });
  }

  const optionId = parseInt(option_id);
  const cfg = GYG_OPTION_CONFIG[optionId];
  if (!cfg) {
    return res.status(404).json({ error: `Unknown option_id: ${optionId}` });
  }

  const tourIds = GYG_OPTION_TO_TOURS[optionId] || [];
  const slots = getSlotsForOption(optionId);

  try {
    // Get all active bookings for this option's tours in the date range
    const bookings = await db`
      SELECT booking_date, booking_time, SUM(passengers) as booked
      FROM bookings
      WHERE tour_id = ANY(${tourIds})
        AND booking_date BETWEEN ${date_from} AND ${date_to}
        AND payment_status NOT IN ('CANCELLED', 'REFUNDED')
      GROUP BY booking_date, booking_time
    `;

    // Index bookings by date+time for fast lookup
    const bookedMap = {};
    for (const row of bookings) {
      const dateKey = row.booking_date.toISOString().split("T")[0];
      const timeKey = row.booking_time.slice(0, 5); // "HH:MM"
      bookedMap[`${dateKey}_${timeKey}`] = parseInt(row.booked);
    }

    // Build availability response per day
    const availabilities = [];
    const from = new Date(date_from);
    const to = new Date(date_to);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      for (const time of slots) {
        const booked = bookedMap[`${dateStr}_${time}`] || 0;
        const vacancies = Math.max(0, cfg.maxPax - booked);

        availabilities.push({
          date: dateStr,
          time: time,
          option_id: optionId,
          vacancies: vacancies,
          available: vacancies > 0,
        });
      }
    }

    return res.status(200).json({ availabilities });

  } catch (err) {
    console.error("[GYG availability] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
