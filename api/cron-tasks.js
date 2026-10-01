/**
 * /api/cron-tasks — endpoint único para las dos tareas periódicas que antes
 * eran archivos (y funciones serverless) separados. Vercel Hobby limita a
 * 12 Serverless Functions por deployment; unificarlas acá deja lugar para
 * el resto de la API. Disparado por triggers de Apps Script (no por cron
 * de Vercel) vía ?task=gyg-expire-holds | payment-reminder | post-tour-email.
 */

import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import { getBookingRangeMinutes } from "../lib/gyg-config.js";

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
 * Re-verifica el estado real en SumUp antes de recordarle a alguien que
 * pague. Cubre el caso en que el pago SÍ se acreditó pero el booking se
 * quedó en PENDING — el webhook de SumUp no siempre llega (no está
 * garantizado que esté suscrito/alcanzable) y el fallback del navegador
 * (polling en reserve.js) depende de que el cliente no haya cerrado la
 * pestaña original tras pagar en la pestaña de SumUp. Sin este chequeo,
 * a un cliente que ya pagó le llegaría un email pidiéndole que pague de
 * nuevo. Devuelve el status de SumUp, o null si no se pudo verificar.
 */
async function getSumUpStatus(sumupId) {
  const SUMUP_ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  if (!SUMUP_ACCESS_TOKEN || !sumupId) return null;
  try {
    const r = await fetch(`https://api.sumup.com/v0.1/checkouts/${sumupId}`, {
      headers: { Authorization: `Bearer ${SUMUP_ACCESS_TOKEN}` },
    });
    if (!r.ok) return null;
    const checkout = await r.json();
    return checkout.status || null;
  } catch (e) {
    warn(`[cron-tasks/payment-reminder] SumUp verify failed for ${sumupId}:`, e.message);
    return null;
  }
}

function toDateStr(bookingDate) {
  return bookingDate instanceof Date ? bookingDate.toISOString().slice(0, 10) : bookingDate;
}

/** Same recovery as the admin "Mark as Paid" button — flips the row to
 * PAID and fires the same sync GAS does on a normal successful payment
 * (calendar event + confirmation email), so a self-healed booking looks
 * exactly like one that went through the happy path. */
async function markPaidAndSync(b) {
  await db`UPDATE bookings SET payment_status = 'PAID' WHERE id = ${b.id}`;
  await callGAS({
    action: "createBooking",
    tour: b.tour_id,
    tourTitle: b.tour_name,
    name: b.customer_name,
    email: b.customer_email,
    phone: b.customer_phone,
    qty: b.passengers,
    tapas: b.extras,
    date: toDateStr(b.booking_date),
    time: b.booking_time ? String(b.booking_time).substring(0, 5) : b.booking_time,
    amount: b.total_price,
    lang: b.lang,
    sumup_checkout_id: b.sumup_id,
  });
}

/**
 * Bookings 'web' que quedaron PENDING (el cliente abrió el checkout de
 * SumUp pero no completó el pago) hace más de 10 minutos. Antes de
 * mandar el recordatorio, re-verifica con SumUp: si el pago sí se
 * acreditó, se auto-corrige a PAID (createBooking + email de
 * confirmación) en vez de pedirle que pague de nuevo. Si sigue sin
 * pagar, se le manda el recordatorio — una sola vez por booking
 * (reminder_sent_at) — ignorando las PENDING de más de 24h (ya
 * abandonadas de verdad).
 */
let reminderColumnEnsured = false;
async function ensureReminderColumn() {
  if (reminderColumnEnsured) return;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE`;
  reminderColumnEnsured = true;
}

async function runPaymentReminder(req, res) {
  await ensureReminderColumn();

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
  let recovered = 0;
  for (const b of rows) {
    const sumupStatus = await getSumUpStatus(b.sumup_id);

    if (sumupStatus === "PAID") {
      try {
        await markPaidAndSync(b);
        recovered++;
        log(`[cron-tasks/payment-reminder] Recovered booking ${b.id} — SumUp shows PAID, DB was stuck PENDING`);
      } catch (e) {
        logError(`[cron-tasks/payment-reminder] Recovery failed for booking ${b.id}:`, e.message);
      }
      continue; // no reminder for someone who already paid
    }

    const gasResult = await callGAS({
      action: "paymentReminder",
      name: b.customer_name,
      email: b.customer_email,
      tour: b.tour_id,
      tourTitle: b.tour_name,
      date: toDateStr(b.booking_date),
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

  log(`[cron-tasks/payment-reminder] Checked ${rows.length}, recovered ${recovered}, sent ${sent} reminder(s)`);
  return res.status(200).json({ checked: rows.length, recovered, sent });
}

/**
 * Email de reseña de Google 1h después de que termina el tour. Solo
 * bookings PAID; GYG excluido salvo REVIEW_EMAIL_INCLUDE_GYG=true (los
 * términos de GYG pueden prohibir pedir reseñas fuera de su plataforma).
 * Fin = booking_end_time, o duración del tour si es null (reservas web).
 * Ventana de envío: fin+1h … fin+25h, para no mandar emails viejos si el
 * trigger estuvo caído. Reclama la fila (review_email_sent_at) antes de
 * enviar → sin duplicados; si GAS falla la libera para reintentar.
 */
let reviewColumnEnsured = false;
async function ensureReviewColumn() {
  if (reviewColumnEnsured) return;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_email_sent_at TIMESTAMP WITH TIME ZONE`;
  reviewColumnEnsured = true;
}

/** Hora de pared en Copenhague como "minutos UTC-falsos" (comparables con Date.UTC(fecha)+min). */
function copenhagenNowWallMs() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

async function runPostTourEmail(req, res) {
  const reviewUrl = process.env.GOOGLE_REVIEW_URL;
  if (!reviewUrl) {
    warn("[cron-tasks/post-tour-email] GOOGLE_REVIEW_URL not set — skipping");
    return res.status(200).json({ skipped: "GOOGLE_REVIEW_URL not set" });
  }
  await ensureReviewColumn();
  const includeGyg = process.env.REVIEW_EMAIL_INCLUDE_GYG === "true";

  const result = await db`
    SELECT id, tour_id, tour_name, customer_name, customer_email, lang, source,
           booking_date::text AS booking_date,
           booking_time::text AS booking_time,
           booking_end_time::text AS booking_end_time
    FROM bookings
    WHERE payment_status = 'PAID'
      AND review_email_sent_at IS NULL
      AND customer_email IS NOT NULL
      AND booking_time IS NOT NULL
      AND booking_date >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date - 2
      AND booking_date <= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date
      AND (${includeGyg} OR source IS DISTINCT FROM 'gyg')
  `;
  const rows = result.rows ?? result;

  const nowMs = copenhagenNowWallMs();
  const HOUR = 3600000;
  let sent = 0;
  for (const b of rows) {
    const [, endMin] = getBookingRangeMinutes(b);
    const [y, m, d] = b.booking_date.split("-").map(Number);
    const sendAt = Date.UTC(y, m - 1, d) + endMin * 60000 + HOUR;
    if (nowMs < sendAt || nowMs >= sendAt + 24 * HOUR) continue;

    const claim = await db`
      UPDATE bookings SET review_email_sent_at = NOW()
      WHERE id = ${b.id} AND review_email_sent_at IS NULL
      RETURNING id
    `;
    if ((claim.rows ?? claim).length === 0) continue;

    const gasResult = await callGAS({
      action: "sendReviewEmail",
      name: b.customer_name,
      email: b.customer_email,
      tour: b.tour_id,
      tourTitle: b.tour_name,
      lang: b.lang,
      reviewUrl,
    });

    if (gasResult && gasResult.success) {
      sent++;
    } else {
      const permanent = gasResult && /email/i.test(gasResult.error || "");
      if (!permanent) await db`UPDATE bookings SET review_email_sent_at = NULL WHERE id = ${b.id}`;
      warn(`[cron-tasks/post-tour-email] GAS failed for booking ${b.id}:`, gasResult && gasResult.error);
    }
  }

  log(`[cron-tasks/post-tour-email] Checked ${rows.length}, sent ${sent}`);
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
    if (task === "post-tour-email") return await runPostTourEmail(req, res);
    return res.status(400).json({ error: "Unknown or missing ?task=" });
  } catch (err) {
    logError(`[cron-tasks/${task}] Error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
