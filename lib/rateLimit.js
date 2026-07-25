/**
 * In-memory IP rate limiter for serverless functions.
 * NOTE: Map is per-instance — resets on cold start, not shared across
 * concurrent instances. Best-effort abuse throttle, not a hard guarantee.
 */
const buckets = new Map();

export function getIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress
    || "unknown";
}

export function isRateLimited(key, { max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.first > windowMs) {
    buckets.set(key, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
