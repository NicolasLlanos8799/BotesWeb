/**
 * Admin login OTP (2FA) — single-row table, one pending code at a time.
 * Node-only (uses Postgres via lib/db.js) — never import this from
 * middleware.js (Edge runtime, no fs/path/db support).
 */

import db from './db.js';
import { signHmac, timingSafeEqual } from './adminAuth.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export async function ensureOtpTable() {
  await db`
    CREATE TABLE IF NOT EXISTS admin_otp (
      id         SERIAL PRIMARY KEY,
      code_hash  TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts   INT NOT NULL DEFAULT 0
    )
  `;
}

export function generateOtpCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return n.toString().padStart(6, '0');
}

/** Generates a code, stores its hash (replacing any pending one) and returns the plaintext code to email. */
export async function createOtp(secret) {
  await ensureOtpTable();
  const code = generateOtpCode();
  const codeHash = await signHmac(code, secret);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await db`DELETE FROM admin_otp`;
  await db`INSERT INTO admin_otp (code_hash, expires_at) VALUES (${codeHash}, ${expiresAt})`;

  return code;
}

/** Verifies a submitted code against the pending OTP row. Consumes it (deletes) on success or exhaustion. */
export async function verifyOtp(code, secret) {
  if (!code || !secret) return false;

  const result = await db`SELECT id, code_hash, expires_at, attempts FROM admin_otp ORDER BY id DESC LIMIT 1`;
  const row = (result.rows ?? result)[0];
  if (!row) return false;

  if (row.attempts >= OTP_MAX_ATTEMPTS || new Date(row.expires_at).getTime() < Date.now()) {
    await db`DELETE FROM admin_otp WHERE id = ${row.id}`;
    return false;
  }

  const submittedHash = await signHmac(String(code), secret);
  const valid = timingSafeEqual(submittedHash, row.code_hash);

  if (valid) {
    await db`DELETE FROM admin_otp WHERE id = ${row.id}`;
    return true;
  }

  await db`UPDATE admin_otp SET attempts = attempts + 1 WHERE id = ${row.id}`;
  return false;
}
