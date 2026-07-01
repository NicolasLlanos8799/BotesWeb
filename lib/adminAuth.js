/**
 * Utility for administrative authentication.
 * Uses Web Crypto API to sign/verify tokens using standard HMAC-SHA256
 * to eliminate length extension attack vectors.
 */

// Constant-time string comparison to prevent timing attacks
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Helper to sign a message using HMAC-SHA256 and Web Crypto API
async function signHmac(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    messageData
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a signed session token.
 * Format: timestamp.hash
 */
export async function generateSessionToken(secret) {
  const timestamp = Date.now().toString();
  const signature = await signHmac(timestamp, secret);
  return `${timestamp}.${signature}`;
}

/**
 * Verifies a signed session token.
 */
export async function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const [timestampStr, signature] = token.split('.');
  if (!timestampStr || !signature) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Validate expiration: 24 hours (86,400,000 milliseconds)
  const age = Date.now() - timestamp;
  if (age < 0 || age > 24 * 60 * 60 * 1000) return false;

  const expectedSignature = await signHmac(timestampStr, secret);
  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Checks if the request has a valid admin session cookie.
 * Serves serverless functions.
 */
export async function isAdminAuthenticated(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    })
  );

  return verifySessionToken(cookies['admin_auth'], secret);
}
