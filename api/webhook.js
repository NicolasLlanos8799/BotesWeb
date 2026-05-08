export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ received: true });
  }

  // Webhook path intentionally passive.
  // Polling + /api/create-booking-from-payment is the authoritative payment->booking flow.
  return res.status(200).json({ received: true, mode: "passive" });
}
