import { isAdminAuthenticated } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!(await isAdminAuthenticated(req))) return res.status(401).json({ error: "Unauthorized" });

  const { name, email, phone, tour, tourTitle, date, time, qty, lang, amount, currency, sumup_checkout_id } = req.body || {};
  if (!email || !date || !time) return res.status(400).json({ error: "Missing email, date or time" });

  try {
    const gasRes = await fetch(process.env.GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resendEmail",
        name, email, phone, tour, tourTitle, date, time, qty, lang, amount, currency,
        sumup_checkout_id
      })
    });

    const result = await gasRes.json();
    if (!result.success) return res.status(500).json({ error: result.error || "GAS error" });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
