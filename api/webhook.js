
export default async function handler(req, res) {
  const SUMUP_API_BASE = "https://api.sumup.com";
  const ACCESS_TOKEN = process.env.SUMUP_ACCESS_TOKEN;
  const GAS_URL = process.env.GAS_URL;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const event = req.body;
    console.log("DEDICATED WEBHOOK RECEIVED:", JSON.stringify(event));

    // SumUp Webhook format usually has event_type and id
    const isPaidEvent = event.event_type === "checkout.paid";
    const isStatusChangedEvent = event.event_type === "CHECKOUT_STATUS_CHANGED";

    if (isPaidEvent || isStatusChangedEvent) {
      const checkoutId = event.id || event.checkout_id;
      
      // 1. Verify status with SumUp
      const detailsResponse = await fetch(`${SUMUP_API_BASE}/v0.1/checkouts/${checkoutId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
      });

      if (!detailsResponse.ok) {
        console.error("Webhook Verification Failed for checkout:", checkoutId);
        return res.status(200).json({ received: true, warning: "Verification failed" });
      }

      const details = await detailsResponse.json();
      console.log("Verified Status from SumUp:", details.status);

      if (details.status === "PAID") {
        // 2. Create the booking in GS
        const bookingData = {
          ...(details.metadata || {}),
          payment_status: "PAID",
          sumup_checkout_id: checkoutId
        };

        console.log("Calling GAS to create booking...");
        const gasResponse = await fetch(`${GAS_URL}?action=createBooking`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingData)
        });

        console.log("GAS Response Status:", gasResponse.status);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Dedicated Webhook Error:", error);
    return res.status(200).json({ error: "Internal processing error but acknowledging webhook" });
  }
}
