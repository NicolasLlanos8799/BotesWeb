import {
  assertEnv,
  fetchWithTimeout,
  isValidHttpUrl,
  normalizeMetadata,
  safeMetadataForLogs,
  validateMetadata
} from "./_lib/safety.js";
import { getStorageMode, saveCheckoutMetadata } from "./_lib/payment-store.js";

/**
 * Vercel Serverless Function: SumUp API Proxy
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;

  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowedDomains = ["vercel.app", "localhost", "127.0.0.1", "seaduced.dk"];
  const isAllowedDomain = allowedDomains.some(domain => origin.includes(domain) || referer.includes(domain));

  if (!isAllowedDomain && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Forbidden: Unauthorized Origin" });
  }

  const { action } = req.query;

  try {
    assertEnv("SUMUP_ACCESS_TOKEN", ACCESS_TOKEN);

    if (action === "createCheckout") {
      const { amount, currency, checkout_reference, return_url, description, metadata } = req.body || {};

      if (!amount || !currency || !checkout_reference) {
        return res.status(400).json({ error: "Missing required fields (amount, currency, reference)" });
      }

      const normalizedMetadata = normalizeMetadata(metadata);
      const metadataValidation = validateMetadata(normalizedMetadata);
      if (!metadataValidation.ok) {
        return res.status(400).json({
          error: "Missing or invalid metadata",
          details: metadataValidation.missing
        });
      }

      const sumupResponse = await fetchWithTimeout(`${SUMUP_API_BASE}/v0.1/checkouts`, {
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
          metadata: {
            ...normalizedMetadata,
            checkout_reference
          },
          merchant_code: process.env.SUMUP_MERCHANT_CODE,
          hosted_checkout: {
            enabled: true
          }
        })
      }, 12000);

      const data = await sumupResponse.json();

      if (!sumupResponse.ok) {
        console.error("[checkout.create] SumUp API Error", { status: sumupResponse.status, details: data });
        return res.status(sumupResponse.status).json(data);
      }

      if (data?.id) {
        await saveCheckoutMetadata(data.id, normalizedMetadata);
        console.log("[checkout.metadata.stored]", {
          checkout_id: data.id,
          mode: getStorageMode(),
          metadata: safeMetadataForLogs(normalizedMetadata)
        });
      }

      console.log("[checkout.create.success]", {
        checkout_id: data?.id,
        amount,
        currency,
        storage_mode: getStorageMode()
      });

      return res.status(sumupResponse.status).json(data);
    }

    if (action === "getCheckoutStatus") {
      const { checkout_id } = req.query;
      if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

      const response = await fetchWithTimeout(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${ACCESS_TOKEN}`
        }
      }, 9000);

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (action === "webhook") {
      return res.status(200).json({ received: true, message: "Webhook acknowledged. Polling flow is authoritative." });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    if (String(error.message || "").includes("environment variable")) {
      return res.status(500).json({ success: false, error: error.message });
    }
    if (!process.env.GAS_URL || !isValidHttpUrl(process.env.GAS_URL)) {
      console.error("[env] GAS_URL is missing or invalid");
    }
    console.error("SumUp Proxy Error:", error);
    return res.status(502).json({ success: false, error: "Failed to communicate with SumUp API." });
  }
}
