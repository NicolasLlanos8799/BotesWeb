import { generateSessionToken, timingSafeEqual } from '../../lib/adminAuth.js';

// Best-effort in-memory rate limiter (per warm lambda instance).
// Not a substitute for edge/WAF rate limiting, but raises the bar for brute force.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attemptsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  // Constant-time comparison + fixed delay to blunt timing/brute-force attacks
  const valid = !!password && !!adminPassword && timingSafeEqual(password, adminPassword);
  await sleep(300);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server authentication misconfigured' });
  }

  const token = await generateSessionToken(secret);
  const isProd = process.env.NODE_ENV === 'production';

  res.setHeader(
    'Set-Cookie',
    `admin_auth=${token}; HttpOnly; ${isProd ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=86400`
  );

  return res.status(200).json({ success: true });
}

