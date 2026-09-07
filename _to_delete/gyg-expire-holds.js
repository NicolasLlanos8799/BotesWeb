/**
 * /api/gyg-expire-holds — cron (Vercel), cada 15 min.
 * Cancela holds de GYG (RESERVED) sin confirmar tras 65min y borra el evento
 * gris del calendario. GYG no siempre llama /cancel-reservation/ cuando un
 * hold expira, así que hay que barrerlos nosotros.
 */

import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";

function callGAS(payload) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return Promise.resolve();
  return fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(e => warn("[GYG expire→GAS] Error:", e.message));
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await db`
      UPDATE bookings
      SET payment_status = 'CANCELLED'
      WHERE source = 'gyg'
        AND payment_status = 'RESERVED'
        AND created_at < NOW() - INTERVAL '65 minutes'
      RETURNING gyg_booking_id
    `;
    const rows = result.rows ?? result;

    for (const row of rows) {
      await callGAS({ action: "deleteHoldEvent", gyg_booking_id: row.gyg_booking_id });
    }

    log(`[GYG expire-holds] Expired ${rows.length} stale reservation(s)`);
    return res.status(200).json({ expired: rows.length });
  } catch (err) {
    logError("[GYG expire-holds] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
