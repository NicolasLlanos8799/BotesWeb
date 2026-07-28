import { log, warn, error as logError } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";

/**
 * Notifies the customer by email when a payment did not go through
 * (FAILED / EXPIRED). Verifies status with SumUp first — never trusts
 * the frontend's claim that a payment failed.
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isRateLimited(`payment-failed:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  const { checkout_id, metadata: frontendMetadata } = req.body || {};
  if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

  try {
    // 1. VERIFY status with SumUp (never trust frontend)
    const sumupRes = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!sumupRes.ok) return res.status(502).json({ error: "Could not verify checkout" });
    const checkout = await sumupRes.json();

    if (checkout.status !== "FAILED" && checkout.status !== "EXPIRED") {
      log("[PAYMENT-FAILED] Not FAILED/EXPIRED, skipping. Status:", checkout.status);
      return res.status(200).json({ success: false, message: "Checkout is not failed/expired" });
    }

    // 2. GET metadata (SumUp first, then frontend backup)
    let metadata = null;
    if (checkout.metadata && Object.keys(checkout.metadata).length > 0) {
      metadata = checkout.metadata;
    } else if (frontendMetadata && Object.keys(frontendMetadata).length > 0) {
      metadata = frontendMetadata;
    }

    if (!metadata || !metadata.email) {
      warn("[PAYMENT-FAILED] No valid metadata/email for:", checkout_id);
      return res.status(200).json({ success: false, message: "No email to notify" });
    }

    // 3. TRIGGER GAS — sends the "payment failed" email to the customer
    const notifyData = {
      ...metadata,
      sumup_checkout_id: checkout_id,
      status: checkout.status
    };
    log("[PAYMENT-FAILED] Notifying GAS:", JSON.stringify(notifyData));

    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "paymentFailed", ...notifyData })
    });

    const gasResult = await gasResponse.text();
    log("[PAYMENT-FAILED] GAS response:", gasResponse.status, gasResult);

    return res.status(200).json({ success: true, notified: true });

  } catch (error) {
    logError("[PAYMENT-FAILED] Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
