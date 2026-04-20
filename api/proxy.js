/**
 * Vercel Serverless Function: Google Apps Script Proxy
 * Bypasses 3rd-party tracking protection and Incognito-mode restrictions.
 */
export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyPmktdM6g_cfzrvCdf4SiKAoiT_D9jfJsx5R3_mE1-M1oczMGdKCHC9Sh0DzSJgNiJ2w/exec";
  
  // Forward all query parameters
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${GAS_URL}?${query}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json, text/javascript, */*',
        'User-Agent': req.headers['user-agent'] || 'Vercel-Proxy'
      },
      redirect: 'follow'
    });

    const body = await response.text();
    const contentType = response.headers.get('content-type');

    // Default to JSON if not specified, to handle GAS plain text responses
    res.setHeader('Content-Type', contentType || 'application/json');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(response.status).send(body);

  } catch (error) {
    console.error("Proxy failure:", error);
    res.status(502).json({ 
      success: false, 
      error: "Proxy could not reach Google Apps Script." 
    });
  }
}
