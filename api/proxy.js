/**
 * Vercel Serverless Function: Google Apps Script Proxy
 * Bypasses 3rd-party tracking protection and Incognito-mode restrictions.
 */
export default async function handler(req, res) {
  const GAS_URL = "https://script.google.com/macros/s/AKfycbyPmktdM6g_cfzrvCdf4SiKAoiT_D9jfJsx5R3_mE1-M1oczMGdKCHC9Sh0DzSJgNiJ2w/exec";
  
  const query = new URLSearchParams(req.query).toString();
  const targetUrl = `${GAS_URL}?${query}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // Forward basic safety headers
        'Accept': 'application/javascript, application/json, text/plain, */*',
        'User-Agent': req.headers['user-agent'] || 'Vercel-Proxy'
      },
      redirect: 'follow'
    });

    // Get the response body
    const body = await response.text();
    const contentType = response.headers.get('content-type');

    // Forward the response back to the browser
    res.setHeader('Content-Type', contentType || 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(response.status).send(body);

  } catch (error) {
    console.error("Proxy failure:", error);
    res.status(502).json({ 
      success: false, 
      error: "Proxy could not reach Google Apps Script. Please verify your internet connection." 
    });
  }
}
