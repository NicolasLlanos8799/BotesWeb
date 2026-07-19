import db from "../lib/db.js";

const WINE_SLOTS = ["10:00", "12:00", "14:00", "16:00", "18:00"];

// Statuses that occupy a group slot
const ACTIVE_STATUSES = ["PAID", "RESERVED", "PENDING"];

/**
 * GET /api/wine-availability?date=YYYY-MM-DD
 *
 * Returns slot availability for the Wine Tasting group experience.
 * Each slot supports max 2 independent groups (max 6 pax each).
 *
 * Response:
 * {
 *   "10:00": { groups: 0, status: "available" },
 *   "12:00": { groups: 1, status: "partial" },
 *   "14:00": { groups: 2, status: "full" },
 *   ...
 * }
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Missing or invalid date (YYYY-MM-DD)" });
  }

  try {
    const dbResult = await db`
      SELECT booking_time, COUNT(*) as group_count
      FROM bookings
      WHERE tour_id = 'book-wine'
        AND booking_date = ${date}
        AND payment_status = ANY(${ACTIVE_STATUSES})
      GROUP BY booking_time
    `;
    const rows = dbResult.rows ?? dbResult;

    // Build a map: "HH:MM" -> group count
    const countMap = {};
    for (const row of rows) {
      // booking_time may come as "HH:MM:SS" from Postgres
      const time = String(row.booking_time).substring(0, 5);
      countMap[time] = Number(row.group_count);
    }

    const result = {};
    for (const slot of WINE_SLOTS) {
      const groups = countMap[slot] || 0;
      result[slot] = {
        groups,
        status: groups === 0 ? "available" : groups === 1 ? "partial" : "full",
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("[wine-availability] DB error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
