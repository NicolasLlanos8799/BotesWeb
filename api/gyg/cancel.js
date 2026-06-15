/**
 * POST /api/gyg/cancel
 *
 * GYG calls this when a booking is cancelled on their platform.
 * Marks the booking as CANCELLED in Postgres.
 *
 * Auth: HTTP Basic Auth (GYG_BASIC_USER / GYG_BASIC_PASS)
 */

import db from "../../lib/db.js";
import { validateGYGAuth } from "../../lib/gyg-config.js";

export default async function handler(req, res) {
  if (!validateGYGAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { booking_id } = req.body || {};

  if (!booking_id) {
    return res.status(400).json({ error: "Missing booking_id" });
  }

  try {
    const result = await db`
      UPDATE bookings
      SET payment_status = 'CANCELLED'
      WHERE gyg_booking_id = ${booking_id}
      RETURNING id
    `;

    if (result.length === 0) {
      console.warn(`[GYG cancel] Booking not found: ${booking_id}`);
      // Return 200 anyway — GYG expects idempotent cancellations
      return res.status(200).json({ success: true, note: "Booking not found, no-op" });
    }

    console.log(`[GYG cancel] Cancelled: ${booking_id}`);
    return res.status(200).json({ success: true, booking_id });

  } catch (err) {
    console.error("[GYG cancel] Error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
