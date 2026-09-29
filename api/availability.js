import { getDayBusy, getMonthBusy } from "../lib/availability.js";
import { error as logError } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";

/**
 * Public-site availability (Postgres, not Google Calendar).
 *
 * Google Calendar is still where bookings get an agenda entry (convenience,
 * see api/create-booking-from-payment.js), but it is no longer read for
 * availability — GYG already moved to Postgres, and this endpoint gives the
 * public web the same source of truth instead of going through Apps Script +
 * Calendar (which has a low concurrent-execution quota and was causing
 * intermittent "GAS returned HTML error" failures under normal calendar
 * navigation).
 *
 * Thin wrapper around lib/availability.js — see that file for the actual
 * overlap/date-timezone logic (already written and covered by
 * scripts/compare-availability.js as part of docs/gcal-migration-status.md
 * Fase 2). Reproduces the exact contract the frontend already expects from
 * the old Apps Script actions:
 *   GET ?action=getAvailability&date=&calendar=      -> { busy: [...] }
 *   GET ?action=getMonthlyAvailability&date=&calendar= -> { "YYYY-MM-DD": [...] }
 */
export default async function handler(req, res) {
  const ip = getIp(req);
  if (isRateLimited(`availability:${ip}`, { max: 60, windowMs: 60 * 1000 })) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { action, date, calendar } = req.query;
  const boat = calendar === "boat2" ? "boat2" : "boat1"; // whitelist — never trust the raw param

  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH_RE = /^\d{4}-\d{2}(-\d{2})?$/;

  try {
    if (action === "getAvailability") {
      if (!DAY_RE.test(date || "")) return res.status(400).json({ error: "Missing or malformed date" });
      const busy = await getDayBusy(boat, date);
      res.setHeader('Cache-Control', 'private, max-age=20');
      return res.status(200).json({ busy });
    }

    if (action === "getMonthlyAvailability") {
      if (!MONTH_RE.test(date || "")) return res.status(400).json({ error: "Missing or malformed date" });
      const byDate = await getMonthBusy(boat, date);
      res.setHeader('Cache-Control', 'private, max-age=20');
      return res.status(200).json(byDate);
    }

    return res.status(400).json({ error: "Bad Request: Invalid or missing action" });
  } catch (err) {
    logError("[availability] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
