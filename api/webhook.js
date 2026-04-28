
export default async function handler(req, res) {

  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(200).json({ received: true });
  }

  try {
    const event = req.body;
    const checkoutId = event.id || (event.data && event.data.id);
    if (!checkoutId) return res.status(200).json({ received: true });

    // Verificar el estado real con SumUp
    const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!response.ok) throw new Error("SumUp verify failed");
    const checkout = await response.json();

    if (checkout.status === "PAID") {
      const metadata = checkout.metadata;

      // Solo procedemos si SumUp nos da los metadatos (el webhook no tiene backup de frontend)
      if (metadata && metadata.date && metadata.time) {
        const bookingData = { 
          ...metadata, 
          payment_status: "PAID", 
          sumup_checkout_id: checkoutId 
        };
        
        console.log("Webhook: Creating booking in Google...");
        await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createBooking", ...bookingData })
        });
      } else {
        console.warn("Webhook: Missing metadata in SumUp response. Fallback endpoint will handle it via Polling.");
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(200).json({ received: true, warning: error.message });
  }
}
