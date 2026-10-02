import { isRateLimited, getIp } from "../lib/rateLimit.js";
import { findValidDiscount } from "../lib/discounts.js";
import { error as logError } from "../lib/logger.js";

/** Public: POST { code } → { valid, percent }. Never reveals why a code is invalid. */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`discount-check:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ valid: false, error: "Too many attempts. Try again later." });
  }

  try {
    const discount = await findValidDiscount(req.body?.code);
    if (!discount) return res.status(200).json({ valid: false });
    return res.status(200).json({ valid: true, code: discount.code, percent: discount.percent });
  } catch (err) {
    logError("discount validate error:", err.message);
    return res.status(500).json({ valid: false, error: "Could not validate code" });
  }
}
