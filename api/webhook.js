
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  // 1. MANEJO DE REDIRECCIÓN (GET)
  // Si el cliente llega aquí con el navegador, lo enviamos a la página de éxito
  if (req.method === "GET") {
    // Si SumUp envía parámetros en la URL al volver, los capturamos
    const checkoutId = req.query.checkout_id || req.query.id;
    const successUrl = `/reserve/success.html${checkoutId ? '?checkout_id=' + checkoutId : ''}`;
    return res.redirect(302, successUrl);
  }

  // 2. MANEJO DE WEBHOOK (POST)
  if (req.method === "POST") {
    try {
      const event = req.body;
      console.log("SUMUP Webhook Received (POST):", JSON.stringify(event));

      // Solo procesamos el evento correcto según documentación
      if (event.event_type === "CHECKOUT_STATUS_CHANGED") {
        const checkoutId = event.id;
        
        // --- VERIFICACIÓN OBLIGATORIA ---
        // NUNCA confiamos solo en el mensaje del webhook
        console.log(`Verifying payment for checkout ${checkoutId}...`);
        
        const response = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
        });

        if (!response.ok) {
          console.error("Failed to verify checkout status from SumUp API");
          return res.status(200).json({ received: true, error: "Verification failed" });
        }

        const checkout = await response.json();
        console.log("Confirmed Status from API:", checkout.status);

        // --- LÓGICA DE NEGOCIO ---
        if (checkout.status === "PAID") {
          console.log("Payment confirmed! Creating Google Calendar event...");
          
          const bookingData = {
            ...(checkout.metadata || {}),
            payment_status: "PAID",
            sumup_checkout_id: checkoutId
          };

          const gasResponse = await fetch(`${GAS_URL}?action=createBooking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bookingData)
          });

          console.log("GAS Creation Status:", gasResponse.status);
        } else {
          console.log(`Payment status for ${checkoutId} is ${checkout.status}. Skipping.`);
        }
      }

      // Siempre responder 200 rápido a SumUp para evitar reintentos innecesarios
      return res.status(200).json({ received: true });

    } catch (error) {
      console.error("Webhook processing error:", error.message);
      // Respondemos 200 incluso en error para que SumUp no se quede pillado, 
      // pero logueamos el error para nosotros.
      return res.status(200).json({ received: true, warning: error.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
