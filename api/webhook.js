
export default async function handler(req, res) {

  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  // 1. Solo aceptamos POST (Webhook real de SumUp)
  if (req.method !== "POST") {
    // Si alguien entra por GET (navegador), le mandamos un 200 pero no hacemos nada
    return res.status(200).send("Webhook endpoint is active and listening...");
  }

  try {
    const event = req.body;
    console.log("----- WEBHOOK START -----");
    console.log("TIME:", new Date().toISOString());
    console.log("EVENT:", JSON.stringify(event));

    // Identificar el ID del checkout (puede venir de diferentes formas según el evento)
    const checkoutId = event.id || (event.data && event.data.id);

    if (!checkoutId) {
      return res.status(200).json({ received: true, message: "No checkout ID found in payload" });
    }

    // --- VERIFICACIÓN OBLIGATORIA CON LA API DE SUMUP ---
    console.log(`Verifying checkout ${checkoutId}...`);
    const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch status from SumUp: ${response.statusText}`);
    }

    const checkout = await response.json();
    console.log("Verified status:", checkout.status);

    // --- SI ESTÁ PAGADO, CREAMOS EN GOOGLE ---
    if (checkout.status === "PAID") {
      const bookingData = {
        ...(checkout.metadata || {}),
        payment_status: "PAID",
        sumup_checkout_id: checkoutId
      };

      console.log("Creating booking in Google Calendar...");
      const gasResponse = await fetch(`${GAS_URL}?action=createBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData)
      });

      console.log("Google Apps Script Response:", gasResponse.status);
    }

    // Responder siempre 200 OK a SumUp para evitar reintentos
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Webhook processing error:", error.message);
    return res.status(200).json({ received: true, warning: error.message });
  }
}
