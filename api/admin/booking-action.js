import db from "../../lib/db.js";
import { isAdminAuthenticated } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (!(await isAdminAuthenticated(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // POST /api/admin/booking-action → resend email
  if (req.method === "POST") {
    const { name, email, phone, tour, tourTitle, date, time, qty, lang, tapas, amount, currency, sumup_checkout_id } = req.body || {};
    if (!email || !date || !time) return res.status(400).json({ error: "Missing email, date or time" });

    try {
      const gasRes = await fetch(process.env.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resendEmail",
          name, email, phone, tour, tourTitle, date, time, qty, lang, tapas, amount, currency, sumup_checkout_id
        })
      });
      const result = await gasRes.json();
      if (!result.success) return res.status(500).json({ error: result.error || "GAS error" });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const id = req.query.id;

  try {
    if (req.method === "PUT") {
      const { name, email, phone, date, time, qty, extras, lang, id: bodyId } = req.body || {};
      const putId = id || bodyId;
      if (!putId) return res.status(400).json({ error: "Missing booking id" });
      const result = await db`
        UPDATE bookings SET
          customer_name  = COALESCE(${name   || null}, customer_name),
          customer_email = COALESCE(${email  || null}, customer_email),
          customer_phone = COALESCE(${phone  || null}, customer_phone),
          booking_date   = COALESCE(${date   || null}, booking_date),
          booking_time   = COALESCE(${time   || null}, booking_time),
          passengers     = COALESCE(${qty    ? parseInt(qty)    : null}, passengers),
          extras         = COALESCE(${extras !== undefined && extras !== '' ? parseInt(extras) : null}, extras),
          lang           = COALESCE(${lang   || null}, lang)
        WHERE id = ${putId}
        RETURNING id
      `;
      const rows = result.rows ?? result;
      if (!rows.length) return res.status(404).json({ error: "Booking not found" });
      return res.status(200).json({ success: true, action: "updated" });
    }

    if (!id) return res.status(400).json({ error: "Missing booking id" });

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
