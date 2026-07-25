import { log, warn, error as logError } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";

const ALLOWED_HOSTNAMES = ["seaduced-experience.com", "vercel.app", "localhost", "127.0.0.1", "seaduced.dk"];

// Exact-match or proper-subdomain match against the allowlist — never substring match.
function isAllowedHostname(hostname) {
  if (!hostname) return false;
  return ALLOWED_HOSTNAMES.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function extractHostname(headerValue) {
  if (!headerValue) return "";
  try {
    return new URL(headerValue).hostname;
  } catch {
    return "";
  }
}

/**
 * Vercel Serverless Function: Google Apps Script Proxy (Hardened & Shielded)
 * Includes a "Security Shield" to prevent spam and authorized access.
 */
export default async function handler(req, res) {
  const isDemo = req.query.demo === '1' || req.body?.demo === '1';
  const GAS_URL = (isDemo && process.env.GAS_DEMO_URL) ? process.env.GAS_DEMO_URL : process.env.GAS_URL;

  // --- SECURITY SHIELD ---

  // 1. Domain Lockdown (Only allows your site or localhost for testing)
  const originHost = extractHostname(req.headers.origin);
  const refererHost = extractHostname(req.headers.referer);
  const isAllowedDomain = isAllowedHostname(originHost) || isAllowedHostname(refererHost);

  if (!isAllowedDomain) {
    warn("Security Shield: Blocked request from unauthorized origin:", originHost || refererHost || "None");
    return res.status(403).json({ error: "Forbidden: Unauthorized Origin" });
  }

  // 2. Action Whitelist (Only allows sanctioned booking operations)
  const { action } = req.query;
  const allowedActions = ["getAvailability", "getMonthlyAvailability", "createBooking", "confirmBooking", "listAllBookings"];
  if (!action || !allowedActions.includes(action)) {
    return res.status(400).json({ error: "Bad Request: Invalid or missing action" });
  }

  // 3. Payload Check (Pre-validates booking data)
  if (action === "createBooking" && req.method === "POST") {
    if (isRateLimited(`gas-createBooking:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    const data = req.body;
    if (!data || (typeof data === "object" && (!data.email || !data.date))) {
      return res.status(400).json({ error: "Bad Request: Incomplete booking data" });
    }
  }

  // --- END OF SECURITY SHIELD ---

  // --- BUILD TARGET URL AND OPTIONS ---
  let targetUrl;
  const fetchOptions = {
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Vercel-Serverless) SeaducedBridge/6.0-Secure'
    },
    redirect: 'follow'
  };

  if (req.method === 'POST') {
    // For POST requests: inject `action` into the body (GAS cannot reliably read query params in POST)
    targetUrl = GAS_URL;
    fetchOptions.headers['Content-Type'] = 'application/json';
    
    const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    fetchOptions.body = JSON.stringify({
      action,
      ...bodyData
    });
    
    log("Proxy: POST action injected into body:", action);
    log("Proxy: POST body:", fetchOptions.body);
  } else {
    // For GET requests: use query params as before (GAS reads e.parameter fine in GET)
    const query = new URLSearchParams(req.query).toString();
    targetUrl = `${GAS_URL}?${query}`;
  }

  try {
    log("Proxy: Forwarding to GAS:", targetUrl, "Method:", req.method);
    const response = await fetch(targetUrl, fetchOptions);
    const body = await response.text();
    
    log("Proxy: GAS Response Status:", response.status);
    log("Proxy: GAS Response Body:", body.substring(0, 500));
    
    // If GAS returns an error page (HTML) instead of JSON
    if (body.includes("<!DOCTYPE html>") && response.status !== 200) {
       logError("Proxy: GAS returned HTML error instead of JSON. Check script permissions.");
    }

    const contentType = response.headers.get('content-type');

    res.setHeader('Content-Type', contentType || 'application/json');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(response.status).send(body);

  } catch (error) {
    logError("Proxy critical failure:", error);
    res.status(502).json({ 
      success: false, 
      error: "Cloud bridge failed to reach Google Apps Script." 
    });
  }
}
