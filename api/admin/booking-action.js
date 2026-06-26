import db from "../../lib/db.js";
import { isAdminAuthenticated } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (!(await isAdminAuthenticated(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing booking id" });

  try {
    if (req.method === "DELETE") {
      await db`DELETE FROM bookings WHERE id = ${id}`;
      return res.status(200).json({ success: true, action: "deleted" });
    }

    if (req.method === "PATCH") {
      const result = await db`
        UPDATE bookings SET payment_status = 'CANCELLED' WHERE id = ${id}
        RETURNING id
      `;
      const rows = result.rows ?? result;
      if (!rows.length) return res.status(404).json({ error: "Booking not found" });
      return res.status(200).json({ success: true, action: "cancelled" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("booking-action error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
