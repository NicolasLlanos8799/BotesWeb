import db from "../../lib/db.js";
import { isAdminAuthenticated } from "../../lib/adminAuth.js";

const SUMUP_API_BASE = "https://api.sumup.com";

// ── DB health + connection details ──────────────────────────────────────────
async function checkDB() {
  const start = Date.now();
  try {
    await db`SELECT 1`;
    const latency = Date.now() - start;

    // Check pool vs non-pooling host
    const host = process.env.POSTGRES_HOST || "";
    const isPooler = host.includes("pooler");

    // Last webhook received = last PAID booking created via webhook
    const lastWebhook = await db`
      SELECT created_at, sumup_id, tour_name, customer_email
      FROM bookings
      WHERE payment_status = 'PAID' AND sumup_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    // Abandoned checkouts (PENDING > 1h)
    const abandoned = await db`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE payment_status = 'PENDING'
        AND created_at < NOW() - INTERVAL '1 hour'
    `;

    // Total bookings count
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

// ── SumUp API health ────────────────────────────────────────────────────────
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

// ── Google Apps Script health ───────────────────────────────────────────────
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

// ── Environment variables audit ─────────────────────────────────────────────
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
    // Show partial value hint for non-secret vars
    hint: ["APP_ENV", "SUMUP_MERCHANT_CODE", "POSTGRES_HOST", "POSTGRES_DATABASE"].includes(key)
      ? (process.env[key] || null)
      : process.env[key]
        ? `${process.env[key].slice(0, 4)}…`
        : null,
  }));
}

// ── Vercel deployment info ──────────────────────────────────────────────────
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

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
