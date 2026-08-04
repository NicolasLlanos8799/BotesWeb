import db from "../lib/db.js";
import { generateSessionToken, timingSafeEqual, isAdminAuthenticated } from "../lib/adminAuth.js";
import { error as logError, warn as logWarn } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";
import { notifyGYGAvailability } from "../lib/gyg-notify.js";

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

  const token = await generateSessionToken(secret);
  const isProd = process.env.NODE_ENV === "production";

  res.setHeader(
    "Set-Cookie",
    `admin_auth=${token}; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=86400`
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
    if (limit && source === 'gyg') {
      result = await db`
        SELECT * FROM bookings
        WHERE source = 'gyg' OR customer_email ILIKE '%@reply.getyourguide.com'
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (limit && source === 'web') {
      result = await db`
        SELECT * FROM bookings
        WHERE NOT (source = 'gyg' OR customer_email ILIKE '%@reply.getyourguide.com')
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (limit) {
      result = await db`
        SELECT * FROM bookings
        ORDER BY booking_date DESC, booking_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      result = await db`
        SELECT * FROM bookings
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
    qty, extras, amount, lang, status
  } = req.body || {};

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: "Missing name, email, date or time" });
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
        ${tourId || null}, ${tourName || null}, ${name}, ${email}, ${phone || null},
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
  // NOTE: customer emails from manual admin bookings are disabled for now
  // (per request). The GAS `createBooking` handler only emails the guest
  // when payment_status === 'PAID', so we send 'PENDING' to GAS regardless
  // of the real DB status — this still creates/blocks the calendar event,
  // it just skips the guest invite + confirmation email. The actual
  // payment_status stored in Postgres (paymentStatus) is unaffected.
  // TODO: flip this back to `paymentStatus` once emails should resume.
  const SEND_CUSTOMER_EMAIL = false;
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
          email,
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
      const { name, email, phone, date, time, qty, extras, lang, amount, endTime } = req.body || {};
      const putId = id;
      if (!putId) return res.status(400).json({ error: "Missing booking id" });

      // Self-healing — adds the column on first use so older DBs don't
      // need a manual migration before this field can be saved.
      await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME`;

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
          lang             = COALESCE(${lang   || null}, lang)
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
        RETURNING id, tour_id, tour_name, customer_name, customer_email, customer_phone,
                  booking_date, booking_time, lang
      `;
      const rows = result.rows ?? result;
      if (!rows.length) return res.status(404).json({ error: "Booking not found" });

      // Best-effort — cancellation must succeed even if the notification fails.
      const b = rows[0];
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

export default async function handler(req, res) {
  const route = req.query.route;

  switch (route) {
    case "login": return handleLogin(req, res);
    case "logout": return handleLogout(req, res);
    case "get-bookings": return handleGetBookings(req, res);
    case "booking-action": return handleBookingAction(req, res);
    case "create-booking": return handleCreateBooking(req, res);
    case "ops": return handleOps(req, res);
    default: return res.status(404).json({ error: "Unknown admin route" });
  }
}
