/**
 * /api/cron-tasks — endpoint único para las dos tareas periódicas que antes
 * eran archivos (y funciones serverless) separados. Vercel Hobby limita a
 * 12 Serverless Functions por deployment; unificarlas acá deja lugar para
 * el resto de la API. Disparado por triggers de Apps Script (no por cron
 * de Vercel) vía ?task=gyg-expire-holds | payment-reminder.
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
      warn("[cron-tasks→GAS] Error:", e.message);
      return { success: false, error: e.message };
    });
}

/**
 * Cancela holds de GYG (RESERVED) sin confirmar tras 65min y borra el
 * evento gris del calendario. GYG no siempre llama /cancel-reservation/
 * cuando un hold expira, así que hay que barrerlos nosotros.
 */
async function runGygExpireHolds(req, res) {
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

  log(`[cron-tasks/gyg-expire-holds] Expired ${rows.length} stale reservation(s)`);
  return res.status(200).json({ expired: rows.length });
}

/**
 * Bookings 'web' que quedaron PENDING (el cliente abrió el checkout de
 * SumUp pero no completó el pago) hace más de 10 minutos reciben un email
 * de recordatorio. Se envía una sola vez por booking (reminder_sent_at) y
 * se ignoran las PENDING de más de 24h (ya perdidas / abandonadas).
 */
async function runPaymentReminder(req, res) {
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
      warn(`[cron-tasks/payment-reminder] GAS failed for booking ${b.id}:`, gasResult && gasResult.error);
    }
  }

  log(`[cron-tasks/payment-reminder] Sent ${sent}/${rows.length} reminder(s)`);
  return res.status(200).json({ checked: rows.length, sent });
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const task = req.query.task;

  try {
    if (task === "gyg-expire-holds") return await runGygExpireHolds(req, res);
    if (task === "payment-reminder") return await runPaymentReminder(req, res);
    return res.status(400).json({ error: "Unknown or missing ?task=" });
  } catch (err) {
    logError(`[cron-tasks/${task}] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
