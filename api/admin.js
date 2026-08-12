import db from "../lib/db.js";
import { generateSessionToken, timingSafeEqual, isAdminAuthenticated } from "../lib/adminAuth.js";
import { createOtp, verifyOtp } from "../lib/adminOtp.js";
import { error as logError, warn as logWarn } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";
import { notifyGYGAvailability, notifyGYGBoatRange } from "../lib/gyg-notify.js";
import { ensureBlockedSlotsTable } from "../lib/blocked-slots.js";
import crypto from "crypto";

const SUMUP_API_BASE = "https://api.sumup.com";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleLogin(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = getIp(req);
  if (isRateLimited(`admin-login:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const valid = !!password && !!adminPassword && timingSafeEqual(password, adminPassword);
  await sleep(300);

  if (!valid) return res.status(401).json({ error: "Invalid password" });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: "Server authentication misconfigured" });

  const code = await createOtp(secret);

  if (process.env.GAS_URL) {
    try {
      const gasRes = await fetch(process.env.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendOtp", code })
      });
      if (!gasRes.ok) {
        logWarn("login OTP GAS sync warning:", gasRes.status);
        return res.status(500).json({ error: "Could not send verification code" });
      }
    } catch (err) {
      logWarn("login OTP GAS sync error:", err.message);
      return res.status(500).json({ error: "Could not send verification code" });
    }
  } else {
    return res.status(500).json({ error: "GAS_URL not configured — cannot send verification code" });
  }

  return res.status(200).json({ success: true, needsOtp: true });
}

async function handleVerifyOtp(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = getIp(req);
  if (isRateLimited(`admin-otp:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { code } = req.body || {};
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: "Server authentication misconfigured" });

  const valid = await verifyOtp(code, secret);
  if (!valid) return res.status(401).json({ error: "Invalid or expired code" });

  const token = await generateSessionToken(secret);
  const isProd = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    `admin_auth=${token}; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=172800`
  );

  return res.status(200).json({ success: true });
}

async function handleRefresh(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

  const secret = process.env.ADMIN_SECRET;
  const token = await generateSessionToken(secret);
  const isProd = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    `admin_auth=${token}; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=172800`
  );

  return res.status(200).json({ success: true });
}

function handleLogout(req, res) {
  res.setHeader(
    "Set-Cookie",
    "admin_auth=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  res.writeHead(302, { Location: "/admin/login" });
  res.end();
}

async function handleGetBookings(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const source = req.query.source; // 'gyg' | 'web' | undefined (all)

    let result;
    // Los holds temporales de GYG (RESERVED) no se muestran en el panel
    if (limit && source === 'gyg') {
      result = await db`
        SELECT * FROM bookings
        WHERE (source = 'gyg' OR customer_email ILIKE '%@reply.getyourguide.com')
          AND payment_status <> 'RESERVED'
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (limit && source === 'web') {
      result = await db`
        SELECT * FROM bookings
        WHERE NOT (source = 'gyg' OR customer_email ILIKE '%@reply.getyourguide.com')
          AND payment_status <> 'RESERVED'
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (limit) {
      result = await db`
        SELECT * FROM bookings
        WHERE payment_status <> 'RESERVED'
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      result = await db`
        SELECT * FROM bookings
        WHERE payment_status <> 'RESERVED'
        ORDER BY booking_date DESC, booking_time DESC
      `;
    }

    const bookings = result.rows ?? result;
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    logError("Admin API Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function handleCreateBooking(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    tourId, tourName, name, email, phone, date, time, endTime,
    qty, extras, amount, lang, status, sendEmail
  } = req.body || {};

  if (!name || !date || !time) {
    return res.status(400).json({ error: "Missing name, date or time" });
  }

  const passengers = qty ? parseInt(qty) : 1;
  const extrasNum = extras !== undefined && extras !== '' ? parseInt(extras) : 0;
  const amountNum = amount !== undefined && amount !== '' ? parseFloat(amount) : 0;
  const paymentStatus = status || 'PAID';
  const bookingLang = lang || 'english';

  let bookingId;
  try {
    await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME`;

    const result = await db`
      INSERT INTO bookings (
        tour_id, tour_name, customer_name, customer_email, customer_phone,
        passengers, booking_date, booking_time, booking_end_time, extras,
        total_price, payment_status, lang, source
      ) VALUES (
        ${tourId || null}, ${tourName || null}, ${name}, ${email || null}, ${phone || null},
        ${passengers}, ${date}, ${time}, ${endTime || null},
        ${extrasNum}, ${amountNum}, ${paymentStatus}, ${bookingLang}, 'web'
      )
      RETURNING id
    `;
    const rows = result.rows ?? result;
    bookingId = rows[0]?.id;
  } catch (err) {
    logError("create-booking error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  // Booking is saved — everything below is best-effort. A GAS/calendar
  // hiccup shouldn't roll back a booking that's already in the DB; the
  // admin sees a warning instead so they can manually check the calendar.
  //
  // NOTE: the GAS `createBooking` handler only emails the guest when
  // payment_status === 'PAID'. When the admin leaves "Enviar emails"
  // unchecked (or there's no email), we send 'PENDING' to GAS regardless of
  // the real DB status — this still creates/blocks the calendar event, it
  // just skips the guest invite + confirmation email. The actual
  // payment_status stored in Postgres (paymentStatus) is unaffected.
  const SEND_CUSTOMER_EMAIL = Boolean(sendEmail && email);
  let calendarWarning = null;
  if (process.env.GAS_URL) {
    try {
      const gasRes = await fetch(process.env.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createBooking",
          tour: tourId,
          tourTitle: tourName,
          name,
          email: email || "",
          phone: phone || "",
          qty: passengers,
          date,
          time,
          lang: bookingLang,
          tapas: extrasNum,
          payment_status: SEND_CUSTOMER_EMAIL ? paymentStatus : "PENDING",
          sumup_checkout_id: `admin-manual-${bookingId}`,
          amount: amountNum,
          currency: "DKK"
        })
      });
      if (!gasRes.ok) {
        calendarWarning = `Calendar/email sync returned HTTP ${gasRes.status}. Verify the calendar manually.`;
        logWarn("create-booking GAS sync warning:", gasRes.status);
      }
    } catch (err) {
      calendarWarning = "Could not reach the calendar/email service. Verify the calendar manually.";
      logWarn("create-booking GAS sync error:", err.message);
    }
  } else {
    calendarWarning = "GAS_URL not configured — calendar was not blocked and no email was sent.";
  }

  // Keep GetYourGuide's availability in sync too — same as the normal
  // payment flow (fire-and-forget, non-fatal).
  notifyGYGAvailability(tourId, date, time).catch(e =>
    logWarn("create-booking GYG notify error:", e.message)
  );

  return res.status(200).json({ success: true, id: bookingId, warning: calendarWarning });
}

async function handleBookingAction(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

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

  // The Vercel rewrite (?route=booking-action) doesn't always forward the
  // original query string alongside it, so fall back to the JSON body.
  const id = req.query.id || (req.body && req.body.id);

  try {
    if (req.method === "PUT") {
      const { name, email, phone, date, time, qty, extras, lang, amount, endTime, boat } = req.body || {};
      const putId = id;
      if (!putId) return res.status(400).json({ error: "Missing booking id" });

      // Self-healing — adds the column on first use so older DBs don't
      // need a manual migration before this field can be saved.
      await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME`;
      await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS boat TEXT`;

      const newBoat = boat === "boat1" || boat === "boat2" ? boat : null;

      const result = await db`
        UPDATE bookings SET
          customer_name    = COALESCE(${name   || null}, customer_name),
          customer_email   = COALESCE(${email  || null}, customer_email),
          customer_phone   = COALESCE(${phone  || null}, customer_phone),
          booking_date     = COALESCE(${date   || null}, booking_date),
          booking_time     = COALESCE(${time   || null}, booking_time),
          booking_end_time = COALESCE(${endTime || null}, booking_end_time),
          passengers       = COALESCE(${qty    ? parseInt(qty)    : null}, passengers),
          extras           = COALESCE(${extras !== undefined && extras !== '' ? parseInt(extras) : null}, extras),
          total_price      = COALESCE(${amount !== undefined && amount !== '' ? parseFloat(amount) : null}, total_price),
          lang             = COALESCE(${lang   || null}, lang),
          boat             = COALESCE(${newBoat}, boat)
        WHERE id = ${putId}
        RETURNING id, tour_id, boat, gyg_booking_id, sumup_id, customer_name, customer_email,
                  customer_phone, booking_date, booking_time, booking_end_time, passengers,
                  extras, total_price, lang
      `;
      const rows = result.rows ?? result;
      if (!rows.length) return res.status(404).json({ error: "Booking not found" });

      // Propagar el cambio al evento de Google Calendar (fire-and-forget, no fatal)
      if (process.env.GAS_URL) {
        try {
          const b = rows[0];
          // booking_date vuelve como Date a medianoche UTC — leerla con getters UTC
          // para que el día no se corra con la TZ local.
          const d = b.booking_date ? new Date(b.booking_date) : null;
          const dateStr = d
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            : null;
          const timeStr = b.booking_time ? String(b.booking_time).substring(0, 5) : null;
          const endTimeStr = b.booking_end_time ? String(b.booking_end_time).substring(0, 5) : null;

          await fetch(process.env.GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "updateEvent",
              gyg_booking_id: b.gyg_booking_id || null,
              sumup_id: b.sumup_id || null,
              boat: b.boat || null,
              tour: b.tour_id,
              date: dateStr,
              time: timeStr,
              endTime: endTimeStr,
              qty: b.passengers,
              extras: b.extras,
              lang: b.lang,
              amount: b.total_price,
              name: b.customer_name,
              email: b.customer_email,
              phone: b.customer_phone,
            }),
          });
        } catch (err) {
          logWarn("booking-action updateEvent error:", err.message);
        }
      }

      return res.status(200).json({ success: true, action: "updated" });
    }

    if (!id) return res.status(400).json({ error: "Missing booking id" });

    if (req.method === "DELETE") {
      const result = await db`
        DELETE FROM bookings WHERE id = ${id}
        RETURNING gyg_booking_id, sumup_id
      `;
      const rows = result.rows ?? result;
      const b = rows[0];

      // Best-effort — deletion must succeed even if the calendar sync fails.
      if (b && process.env.GAS_URL) {
        try {
          await fetch(process.env.GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "deleteEvent",
              gyg_booking_id: b.gyg_booking_id || null,
              sumup_id: b.sumup_id || null,
            }),
          });
        } catch (err) {
          logWarn("booking-action deleteEvent error:", err.message);
        }
      }

      return res.status(200).json({ success: true, action: "deleted" });
    }

    if (req.method === "PATCH") {
      const result = await db`
        UPDATE bookings SET payment_status = 'CANCELLED' WHERE id = ${id}
        RETURNING id, tour_id, tour_name, customer_name, customer_email, customer_phone,
                  booking_date, booking_time, lang, gyg_booking_id, sumup_id
      `;
      const rows = result.rows ?? result;
      if (!rows.length) return res.status(404).json({ error: "Booking not found" });

      // Best-effort — cancellation must succeed even if the calendar/notification fails.
      const b = rows[0];
      if (process.env.GAS_URL) {
        try {
          await fetch(process.env.GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "deleteEvent",
              gyg_booking_id: b.gyg_booking_id || null,
              sumup_id: b.sumup_id || null,
            }),
          });
        } catch (err) {
          logWarn("booking-action deleteEvent error:", err.message);
        }
      }
      if (b.customer_email && process.env.GAS_URL) {
        try {
          // booking_date comes back as a Date at UTC midnight — read it with
          // UTC getters so the calendar day doesn't shift with local TZ.
          const d = b.booking_date ? new Date(b.booking_date) : null;
          const dateStr = d
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            : null;
          const timeStr = b.booking_time ? String(b.booking_time).substring(0, 5) : null;

          const gasRes = await fetch(process.env.GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sendCancellationEmail",
              name: b.customer_name,
              email: b.customer_email,
              phone: b.customer_phone,
              tour: b.tour_id,
              tourTitle: b.tour_name,
              date: dateStr,
              time: timeStr,
              lang: b.lang
            })
          });
          const gasResult = await gasRes.json();
          if (!gasResult.success) logError("Cancellation email error:", gasResult.error || "GAS error");
        } catch (err) {
          logError("Cancellation email error:", err.message);
        }
      }

      return res.status(200).json({ success: true, action: "cancelled" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    logError("booking-action error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function checkDB() {
  const start = Date.now();
  try {
    await db`SELECT 1`;
    const latency = Date.now() - start;
    const host = process.env.POSTGRES_HOST || "";
    const isPooler = host.includes("pooler");

    const lastWebhook = await db`
      SELECT created_at, sumup_id, tour_name, customer_email
      FROM bookings
      WHERE payment_status = 'PAID' AND sumup_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const abandoned = await db`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE payment_status = 'PENDING'
        AND created_at < NOW() - INTERVAL '1 hour'
    `;

    const totals = await db`
      SELECT payment_status, COUNT(*) as count
      FROM bookings GROUP BY payment_status
    `;

    const statusMap = {};
    for (const row of totals.rows || totals) {
      statusMap[row.payment_status] = parseInt(row.count);
    }

    const webhookRow = (lastWebhook.rows || lastWebhook)[0] || null;
    const abandonedCount = parseInt((abandoned.rows || abandoned)[0]?.count || 0);

    return {
      status: "ok",
      latency,
      host: host || "unknown",
      database: process.env.POSTGRES_DATABASE || "unknown",
      usingPooler: isPooler,
      lastWebhook: webhookRow
        ? {
            at: webhookRow.created_at,
            sumupId: webhookRow.sumup_id,
            tour: webhookRow.tour_name,
            email: webhookRow.customer_email,
          }
        : null,
      bookingCounts: statusMap,
      abandonedCheckouts: abandonedCount,
    };
  } catch (e) {
    return { status: "error", error: e.message, latency: Date.now() - start };
  }
}

async function checkSumUp(token) {
  if (!token) return { status: "error", error: "Token not configured" };
  const start = Date.now();
  try {
    const res = await fetch(`${SUMUP_API_BASE}/v0.1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      return {
        status: "ok",
        latency,
        merchant: data.merchant_profile?.merchant_code,
        country: data.merchant_profile?.country,
        tokenPresent: true,
      };
    }
    return { status: "error", httpCode: res.status, latency, tokenPresent: true };
  } catch (e) {
    return { status: "error", error: e.message, latency: Date.now() - start, tokenPresent: !!token };
  }
}

async function checkGAS(gasUrl) {
  if (!gasUrl) return { status: "error", error: "GAS_URL not configured" };
  const start = Date.now();
  try {
    const res = await fetch(`${gasUrl}?action=ping`, {
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    return { status: res.ok ? "ok" : "warn", httpCode: res.status, latency };
  } catch (e) {
    return { status: "error", error: e.message, latency: Date.now() - start };
  }
}

function auditEnv() {
  const vars = [
    { key: "APP_ENV",               label: "App Environment",        critical: true },
    { key: "SUMUP_ACCESS_TOKEN",    label: "SumUp Access Token",     critical: true },
    { key: "SUMUP_MERCHANT_CODE",   label: "SumUp Merchant Code",    critical: true },
    { key: "GAS_URL",               label: "Google Apps Script URL", critical: true },
    { key: "POSTGRES_URL",          label: "Postgres URL (pooling)", critical: true },
    { key: "POSTGRES_URL_NON_POOLING", label: "Postgres URL (direct)", critical: false },
    { key: "POSTGRES_HOST",         label: "Postgres Host",          critical: false },
    { key: "POSTGRES_DATABASE",     label: "Postgres Database",      critical: false },
    { key: "ADMIN_PASSWORD",        label: "Admin Password",         critical: true },
    { key: "ADMIN_SECRET",          label: "Admin Secret",           critical: true },
  ];

  return vars.map(({ key, label, critical }) => ({
    key,
    label,
    critical,
    present: !!process.env[key],
    hint: ["APP_ENV", "SUMUP_MERCHANT_CODE", "POSTGRES_HOST", "POSTGRES_DATABASE"].includes(key)
      ? (process.env[key] || null)
      : process.env[key]
        ? `${process.env[key].slice(0, 4)}…`
        : null,
  }));
}

function deploymentInfo() {
  return {
    env:          process.env.VERCEL_ENV || process.env.APP_ENV || "unknown",
    url:          process.env.VERCEL_URL || null,
    region:       process.env.VERCEL_REGION || null,
    commitSha:    process.env.VERCEL_GIT_COMMIT_SHA
                    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
                    : null,
    commitMsg:    process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    commitAuthor: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || null,
    nodeVersion:  process.version,
  };
}

async function handleOps(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

  const [dbResult, sumupResult, gasResult] = await Promise.all([
    checkDB(),
    checkSumUp(process.env.SUMUP_ACCESS_TOKEN),
    checkGAS(process.env.GAS_URL),
  ]);

  const envAudit = auditEnv();
  const missingCritical = envAudit.filter(v => v.critical && !v.present);

  const criticalDown = dbResult.status === "error" || sumupResult.status === "error" || missingCritical.length > 0;
  const hasWarnings  = gasResult.status !== "ok" || (dbResult.abandonedCheckouts || 0) > 0;
  const systemStatus = criticalDown ? "critical" : hasWarnings ? "warn" : "ok";

  return res.status(200).json({
    timestamp:  new Date().toISOString(),
    env:        process.env.APP_ENV || "unknown",
    systemStatus,
    deployment: deploymentInfo(),
    services: {
      db:    dbResult,
      sumup: sumupResult,
      gas:   gasResult,
    },
    envAudit,
  });
}

/* ═══════════════════════════════════════════════════════════
   BLOQUEOS DE HORARIO (tabla blocked_slots + Google Calendar)

   Doble escritura obligatoria:
     - blocked_slots  → lo lee GYG en get-availabilities / reserve
     - Google Calendar → lo lee la web pública (getMonthlyAvailability)
   Si falla el calendario, el bloqueo NO se guarda: prefiero fallar entero
   antes que dejar el bote bloqueado en GYG pero libre en la web.
═══════════════════════════════════════════════════════════ */

const VALID_BOATS = ["boat1", "boat2"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;
const MAX_BLOCK_DAYS = 180;

function eachDate(from, to) {
  const dates = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

async function callGASBlock(payload) {
  if (!process.env.GAS_URL) throw new Error("GAS_URL not configured");
  const gasRes = await fetch(process.env.GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!gasRes.ok) throw new Error(`GAS HTTP ${gasRes.status}`);
  const result = await gasRes.json();
  if (result && result.success === false) throw new Error(result.error || "GAS error");
  return result;
}

async function handleGetBlocks(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

  const from = DATE_RE.test(req.query.from || "") ? req.query.from : null;
  const to = DATE_RE.test(req.query.to || "") ? req.query.to : null;

  try {
    await ensureBlockedSlotsTable();
    const result = from && to
      ? await db`SELECT * FROM blocked_slots WHERE block_date BETWEEN ${from} AND ${to} ORDER BY block_date, start_time`
      : await db`SELECT * FROM blocked_slots WHERE block_date >= CURRENT_DATE - INTERVAL '1 year' ORDER BY block_date, start_time`;
    return res.status(200).json({ blocks: result.rows ?? result });
  } catch (err) {
    logError("get-blocks error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function handleCreateBlock(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "POST") return res.status(405).end();

  const { dateFrom, dateTo, startTime, endTime, boats, reason } = req.body || {};
  const from = dateFrom;
  const to = dateTo || dateFrom;

  if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
    return res.status(400).json({ error: "Fechas inválidas (YYYY-MM-DD)" });
  }
  if (from > to) return res.status(400).json({ error: "dateFrom no puede ser posterior a dateTo" });
  if (!TIME_RE.test(startTime || "") || !TIME_RE.test(endTime || "")) {
    return res.status(400).json({ error: "Horas inválidas (HH:MM, en :00 o :30)" });
  }
  if (startTime >= endTime) return res.status(400).json({ error: "La hora de fin debe ser posterior a la de inicio" });

  const boatList = (Array.isArray(boats) ? boats : []).filter(b => VALID_BOATS.includes(b));
  if (boatList.length === 0) return res.status(400).json({ error: "Selecciona al menos un bote" });

  const dates = eachDate(from, to);
  if (dates.length > MAX_BLOCK_DAYS) {
    return res.status(400).json({ error: `Rango demasiado largo (máx ${MAX_BLOCK_DAYS} días)` });
  }

  const groupId = crypto.randomUUID();
  const label = (reason || "").toString().slice(0, 255) || null;

  // 1) Google Calendar primero — es el que bloquea la web. Si falla, abortamos.
  const createdEvents = [];
  try {
    for (const boat of boatList) {
      for (const date of dates) {
        const result = await callGASBlock({
          action: "createBlockEvent",
          calendar: boat,
          date,
          startTime,
          endTime,
          reason: label || "",
          group_id: groupId,
        });
        createdEvents.push({ boat, date, eventId: result?.eventId || null });
      }
    }
  } catch (err) {
    logError("create-block GAS error:", err.message);
    // Rollback de lo ya creado en el calendario
    await callGASBlock({ action: "deleteBlockEvent", group_id: groupId }).catch(() => {});
    return res.status(502).json({ error: `No se pudo bloquear el calendario: ${err.message}. Nada fue guardado.` });
  }

  // 2) Postgres — lo que lee GYG
  try {
    await ensureBlockedSlotsTable();
    for (const { boat, date, eventId } of createdEvents) {
      await db`
        INSERT INTO blocked_slots (group_id, block_date, start_time, end_time, boat, reason, gcal_event_id)
        VALUES (${groupId}, ${date}, ${startTime}, ${endTime}, ${boat}, ${label}, ${eventId})
      `;
    }
  } catch (err) {
    logError("create-block DB error:", err.message);
    await callGASBlock({ action: "deleteBlockEvent", group_id: groupId }).catch(() => {});
    return res.status(500).json({ error: `${err.message}. Se revirtió el calendario.` });
  }

  // 3) Push a GYG (best-effort, awaited: en Vercel la lambda se congela al responder)
  let notifyWarning = null;
  try {
    for (const boat of boatList) {
      await notifyGYGBoatRange(boat, from, to, startTime, endTime);
    }
  } catch (err) {
    notifyWarning = "Bloqueo guardado, pero GetYourGuide no confirmó la actualización. Se sincronizará en su próximo pull.";
    logWarn("create-block GYG notify error:", err.message);
  }

  return res.status(200).json({
    success: true,
    groupId,
    slots: createdEvents.length,
    warning: notifyWarning,
  });
}

async function handleDeleteBlock(req, res) {
  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });
  if (req.method !== "DELETE" && req.method !== "POST") return res.status(405).end();

  const groupId = req.query.groupId || req.body?.groupId;
  if (!groupId) return res.status(400).json({ error: "Missing groupId" });

  let rows;
  try {
    await ensureBlockedSlotsTable();
    const result = await db`SELECT * FROM blocked_slots WHERE group_id = ${groupId}`;
    rows = result.rows ?? result;
  } catch (err) {
    logError("delete-block read error:", err.message);
    return res.status(500).json({ error: err.message });
  }
  if (rows.length === 0) return res.status(404).json({ error: "Bloqueo no encontrado" });

  let calendarWarning = null;
  try {
    await callGASBlock({ action: "deleteBlockEvent", group_id: groupId });
  } catch (err) {
    calendarWarning = "El bloqueo se eliminó de la base de datos, pero revisa el evento en Google Calendar.";
    logWarn("delete-block GAS error:", err.message);
  }

  try {
    await db`DELETE FROM blocked_slots WHERE group_id = ${groupId}`;
  } catch (err) {
    logError("delete-block DB error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  // Reabrir disponibilidad en GYG
  const dates = rows.map(r => (r.block_date instanceof Date
    ? r.block_date.toISOString().split("T")[0]
    : String(r.block_date).split("T")[0])).sort();
  const boatsAffected = [...new Set(rows.map(r => r.boat))];
  const startTime = String(rows[0].start_time).slice(0, 5);
  const endTime = String(rows[0].end_time).slice(0, 5);

  try {
    for (const boat of boatsAffected) {
      await notifyGYGBoatRange(boat, dates[0], dates[dates.length - 1], startTime, endTime);
    }
  } catch (err) {
    logWarn("delete-block GYG notify error:", err.message);
  }

  return res.status(200).json({ success: true, removed: rows.length, warning: calendarWarning });
}

export default async function handler(req, res) {
  const route = req.query.route;

  switch (route) {
    case "login": return handleLogin(req, res);
    case "verify-otp": return handleVerifyOtp(req, res);
    case "logout": return handleLogout(req, res);
    case "refresh": return handleRefresh(req, res);
    case "get-bookings": return handleGetBookings(req, res);
    case "booking-action": return handleBookingAction(req, res);
    case "create-booking": return handleCreateBooking(req, res);
    case "ops": return handleOps(req, res);
    case "get-blocks": return handleGetBlocks(req, res);
    case "create-block": return handleCreateBlock(req, res);
    case "delete-block": return handleDeleteBlock(req, res);
    default: return res.status(404).json({ error: "Unknown admin route" });
  }
}
