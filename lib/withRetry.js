/**
 * Retries a DB write a couple of times before giving up.
 *
 * Serverless Postgres (Neon/Vercel) drops idle connections and cold-starts
 * often enough that a single transient error (ECONNRESET, connection
 * terminated, timeout) is common and NOT a sign the write is actually bad.
 * A booking insert must not be lost to one of these blips — retry before
 * surfacing the error to the caller.
 *
 * Does NOT retry unique-constraint violations (23505) — those are real
 * duplicates, not transient failures, and retrying won't help.
 */
export async function withRetry(fn, { attempts = 3, delayMs = 300 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.code === '23505') throw err; // real duplicate, don't retry
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}
