import db from "../../lib/db.js";

export default async function handler(req, res) {
  try {
    const result = await db`
      SELECT * FROM bookings
      ORDER BY booking_date DESC, booking_time DESC
    `;
    return res.status(200).json({ success: true, bookings: result.rows });
  } catch (error) {
    console.error("Admin API Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
