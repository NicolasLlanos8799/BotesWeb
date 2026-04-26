/**
 * Vercel Serverless Function: Google Apps Script Proxy (Hardened & Shielded)
 * Includes a "Security Shield" to prevent spam and authorized access.
 */
export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL;
  
  // --- SECURITY SHIELD ---
  
  // 1. Domain Lockdown (Only allows your site or localhost for testing)
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowedDomains = ["vercel.app", "localhost", "127.0.0.1"];
  const isAllowedDomain = allowedDomains.some(domain => origin.includes(domain) || referer.includes(domain));

  if (!isAllowedDomain) {
    console.warn("Security Shield: Blocked request from unauthorized origin:", origin || referer || "None");
    return res.status(403).json({ error: "Forbidden: Unauthorized Origin" });
  }

  // 2. Action Whitelist (Only allows sanctioned booking operations)
  const { action } = req.query;
  const allowedActions = ["getAvailability", "getMonthlyAvailability", "createBooking", "confirmBooking"];
  if (!action || !allowedActions.includes(action)) {
    return res.status(400).json({ error: "Bad Request: Invalid or missing action" });
  }

  // 3. Payload Check (Pre-validates booking data)
  if (action === "createBooking" && req.method === "POST") {
    const data = req.body;
    if (!data || (typeof data === "object" && (!data.email || !data.date))) {
      return res.status(400).json({ error: "Bad Request: Incomplete booking data" });
    }
  }

  // --- END OF SECURITY SHIELD ---

  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${GAS_URL}?${query}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Vercel-Serverless) SeaducedBridge/6.0-Secure'
    },
    redirect: 'follow'
  };

  if (req.method === 'POST' && req.body) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    console.log("Proxy: Forwarding to GAS:", targetUrl);
    const response = await fetch(targetUrl, fetchOptions);
    const body = await response.text();
    
    console.log("Proxy: GAS Response Status:", response.status);
    
    // If GAS returns an error page (HTML) instead of JSON
    if (body.includes("<!DOCTYPE html>") && response.status !== 200) {
       console.error("Proxy: GAS returned HTML error instead of JSON. Check script permissions.");
    }

    const contentType = response.headers.get('content-type');

    res.setHeader('Content-Type', contentType || 'application/json');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(response.status).send(body);

  } catch (error) {
    console.error("Proxy critical failure:", error);
    res.status(502).json({ 
      success: false, 
      error: "Cloud bridge failed to reach Google Apps Script." 
    });
  }
}
