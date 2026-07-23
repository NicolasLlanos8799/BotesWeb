import db from "../lib/db.js";
import { generateSessionToken, timingSafeEqual, isAdminAuthenticated } from "../lib/adminAuth.js";
import { error as logError } from "../lib/logger.js";

const SUMUP_API_BASE = "https://api.sumup.com";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attemptsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleLogin(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
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
    const result = await db`
      SELECT * FROM bookings
      ORDER BY booking_date DESC, booking_time DESC
    `;
    const bookings = result.rows ?? result;
    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    logError("Admin API Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
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
    case "ops": return handleOps(req, res);
    default: return res.status(404).json({ error: "Unknown admin route" });
  }
}
