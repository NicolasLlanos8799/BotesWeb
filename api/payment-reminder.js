/**
 * /api/payment-reminder — cron (Vercel), cada 5 min.
 * Bookings 'web' que quedaron PENDING (el cliente abrió el checkout de SumUp
 * pero no completó el pago) hace más de 10 minutos reciben un email de
 * recordatorio con el link para retomar la reserva. Se envía una sola vez
 * por booking (reminder_sent_at) y se ignoran las PENDING de más de 24h
 * (ya perdidas / abandonadas de verdad).
 */

import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";

function callGAS(payload) {
  const GAS_URL = process.env.GAS_URL;
  if (!GAS_URL) return Promise.resolve({ success: false, error: "GAS_URL not set" });
  return fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(r => r.json())
    .catch(e => {
      warn("[payment-reminder→GAS] Error:", e.message);
      return { success: false, error: e.message };
    });
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE`;

    const result = await db`
      SELECT * FROM bookings
      WHERE payment_status = 'PENDING'
        AND reminder_sent_at IS NULL
        AND customer_email IS NOT NULL
        AND created_at <= NOW() - INTERVAL '10 minutes'
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    const rows = result.rows ?? result;

    let sent = 0;
    for (const b of rows) {
      const gasResult = await callGAS({
        action: "paymentReminder",
        name: b.customer_name,
        email: b.customer_email,
        tour: b.tour_id,
        tourTitle: b.tour_name,
        date: b.booking_date,
        time: b.booking_time,
        qty: b.passengers,
        tapas: b.extras,
        lang: b.lang,
      });

      if (gasResult && gasResult.success) {
        await db`UPDATE bookings SET reminder_sent_at = NOW() WHERE id = ${b.id}`;
        sent++;
      } else {
        warn(`[payment-reminder] GAS failed for booking ${b.id}:`, gasResult && gasResult.error);
      }
    }

    log(`[payment-reminder] Sent ${sent}/${rows.length} reminder(s)`);
    return res.status(200).json({ checked: rows.length, sent });
  } catch (err) {
    logError("[payment-reminder] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
