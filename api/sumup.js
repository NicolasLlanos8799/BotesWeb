/**
 * Vercel Serverless Function: SumUp API Proxy
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  
  console.log("SumUp Token Presence:", !!ACCESS_TOKEN);

  // Domain Lockdown (Optional but recommended)
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowedDomains = ["vercel.app", "localhost", "127.0.0.1", "seaduced.dk"];
  const isAllowedDomain = allowedDomains.some(domain => origin.includes(domain) || referer.includes(domain));

  if (!isAllowedDomain && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Forbidden: Unauthorized Origin" });
  }

  const { action } = req.query;

  if (!ACCESS_TOKEN) {
    return res.status(500).json({ error: "SumUp Access Token not configured on server." });
  }

  try {
    if (action === "createCheckout") {
      const { amount, currency, checkout_reference, return_url, description } = req.body;

      if (!amount || !currency || !checkout_reference) {
         return res.status(400).json({ error: "Missing required fields (amount, currency, reference)" });
      }

      const targetUrl = `${SUMUP_API_BASE}/v0.1/checkouts`;
      console.log("Calling SumUp API:", targetUrl);

      const sumupResponse = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount,
          currency,
          checkout_reference,
          return_url,
          description,
          merchant_code: process.env.SUMUP_MERCHANT_CODE,
          hosted_checkout: {
            enabled: true
          }
        })
      });

      const data = await sumupResponse.json();
      
      if (!sumupResponse.ok) {
        console.error("SumUp API Error Details:", JSON.stringify(data, null, 2));
      }

      return res.status(sumupResponse.status).json(data);
    }
    
    if (action === "getCheckoutStatus") {
      const { checkout_id } = req.query;
      if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

      const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`
        }
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("SumUp Proxy Error:", error);
    return res.status(502).json({ success: false, error: "Failed to communicate with SumUp API." });
  }
}
