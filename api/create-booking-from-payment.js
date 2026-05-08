import {
  assertEnv,
  fetchWithTimeout,
  isValidHttpUrl,
  safeMetadataForLogs,
  validateMetadata
} from "./_lib/safety.js";
import {
  getCheckoutMetadata,
  getStorageMode,
  hasBookingBeenCreated,
  markBookingCreated
} from "./_lib/payment-store.js";

/**
 * Production-safe fallback booking endpoint.
 * Verifies PAID status, loads server-side metadata, calls GAS, and enforces idempotency.
 */
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { checkout_id } = req.body || {};
  if (!checkout_id) return res.status(400).json({ error: "Missing checkout_id" });

  try {
    assertEnv("SUMUP_ACCESS_TOKEN", ACCESS_TOKEN);
    assertEnv("GAS_URL", GAS_URL, isValidHttpUrl);

    console.log("[booking.finalize.start]", { checkout_id, storage_mode: getStorageMode() });

    if (await hasBookingBeenCreated(checkout_id)) {
      console.log("[booking.idempotent.hit]", { checkout_id });
      return res.status(200).json({ success: true, booking_created: true, idempotent: true });
    }

    const sumupRes = await fetchWithTimeout(`${SUMUP_API_BASE}/v0.1/checkouts/${checkout_id}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    }, 9000);

    if (!sumupRes.ok) {
      return res.status(502).json({ success: false, error: "Could not verify payment" });
    }
    const checkout = await sumupRes.json();

    if (checkout.status !== "PAID") {
      console.log("[booking.finalize.pending]", { checkout_id, payment_status: checkout.status });
      return res.status(200).json({ success: false, booking_created: false, message: "Payment not completed" });
    }

    const metadata = await getCheckoutMetadata(checkout_id);
    if (!metadata) {
      console.error("[booking.metadata.missing]", { checkout_id });
      return res.status(409).json({
        success: false,
        booking_created: false,
        error: "Metadata not found in backend storage"
      });
    }

    const metadataValidation = validateMetadata(metadata);
    if (!metadataValidation.ok) {
      return res.status(400).json({
        success: false,
        booking_created: false,
        error: "Metadata invalid",
        details: metadataValidation.missing
      });
    }

    const bookingData = {
      ...metadata,
      payment_status: "PAID",
      sumup_checkout_id: checkout_id
    };

    console.log("[booking.gas.request]", { checkout_id, metadata: safeMetadataForLogs(metadata) });

    const gasResponse = await fetchWithTimeout(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createBooking", ...bookingData })
    }, 12000);

    const rawText = await gasResponse.text();
    let gasResult = null;
    try {
      gasResult = JSON.parse(rawText);
    } catch {
      gasResult = { success: false, error: "Invalid JSON from GAS", raw: rawText.slice(0, 300) };
    }

    console.log("[booking.gas.response]", {
      checkout_id,
      status: gasResponse.status,
      success: Boolean(gasResult?.success)
    });

    if (!gasResponse.ok || !gasResult?.success) {
      return res.status(502).json({
        success: false,
        booking_created: false,
        error: gasResult?.error || "Booking service failed"
      });
    }

    await markBookingCreated(checkout_id);
    return res.status(200).json({ success: true, booking_created: true });
  } catch (error) {
    console.error("[booking.finalize.error]", { checkout_id, message: error.message });
    return res.status(500).json({ success: false, booking_created: false, error: "Internal booking finalization error" });
  }
}
