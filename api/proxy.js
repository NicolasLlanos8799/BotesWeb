/**
 * Vercel Serverless Function: Google Apps Script Proxy (Hardened)
 * Bypasses 3rd-party tracking protection and mobile carrier URL limits.
 * Supports both GET (availability) and POST (bookings).
 */
export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbxe7Gd0iTafGtIP8IWqd0WADdPiOypg13g_0dOU07gNvmTZSl39FmIYGVC1YquddsXHew/exec";
  
  // Forward all query parameters
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${GAS_URL}?${query}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Vercel-Serverless) SeaducedBridge/6.0'
    },
    redirect: 'follow'
  };

  // If the frontend sends a POST, we forward the JSON body to Google
  if (req.method === 'POST' && req.body) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    // If req.body is already an object, stringify it for Google
    fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const response = await fetch(targetUrl, fetchOptions);
    const body = await response.text();
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
