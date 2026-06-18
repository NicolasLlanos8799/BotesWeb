import db from "../../lib/db.js";
import { isAdminAuthenticated } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (!(await isAdminAuthenticated(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }


  try {
    const result = await db`
      SELECT * FROM bookings
      ORDER BY booking_date DESC, booking_time DESC
    `;
    const bookings = result.rows ?? result;
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error("Admin API Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
