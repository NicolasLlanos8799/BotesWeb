import { generateSessionToken } from '../../lib/adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
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

