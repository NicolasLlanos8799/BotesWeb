const MEMORY_TTL_MS = 30 * 60 * 1000;
const memoryStore = new Map();

function now() {
  return Date.now();
}

function cleanupMemoryStore() {
  const ts = now();
  for (const [key, value] of memoryStore.entries()) {
    if (!value || value.expiresAt <= ts) {
      memoryStore.delete(key);
    }
  }
}

setInterval(cleanupMemoryStore, 5 * 60 * 1000).unref?.();

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !isValidUrl(url)) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function upstashRequest(path, body) {
  const cfg = getUpstashConfig();
  if (!cfg) return { ok: false, skipped: true };

  const response = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

export function getStorageMode() {
  return getUpstashConfig() ? "upstash" : "memory";
}

export async function saveCheckoutMetadata(checkoutId, metadata, ttlSeconds = 24 * 60 * 60) {
  const key = `checkout:${checkoutId}`;
  const payload = JSON.stringify({ metadata, createdAt: new Date().toISOString() });

  const cfg = getUpstashConfig();
  if (cfg) {
    await upstashRequest(`/set/${encodeURIComponent(key)}`, [payload, { ex: ttlSeconds }]);
    return { mode: "upstash" };
  }

  memoryStore.set(key, { value: payload, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 });
  return { mode: "memory" };
}

export async function getCheckoutMetadata(checkoutId) {
  const key = `checkout:${checkoutId}`;
  const cfg = getUpstashConfig();
  if (cfg) {
    const result = await upstashRequest(`/get/${encodeURIComponent(key)}`, []);
    if (!result?.result) return null;
    const parsed = JSON.parse(result.result);
    return parsed.metadata || null;
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt <= now()) {
    memoryStore.delete(key);
    return null;
  }
  const parsed = JSON.parse(entry.value);
  return parsed.metadata || null;
}

export async function markBookingCreated(checkoutId, ttlSeconds = 7 * 24 * 60 * 60) {
  const key = `booking:${checkoutId}`;
  const value = JSON.stringify({ createdAt: new Date().toISOString() });

  const cfg = getUpstashConfig();
  if (cfg) {
    await upstashRequest(`/set/${encodeURIComponent(key)}`, [value, { ex: ttlSeconds }]);
    return { mode: "upstash" };
  }

  memoryStore.set(key, { value, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 });
  return { mode: "memory" };
}

export async function hasBookingBeenCreated(checkoutId) {
  const key = `booking:${checkoutId}`;

  const cfg = getUpstashConfig();
  if (cfg) {
    const result = await upstashRequest(`/exists/${encodeURIComponent(key)}`, []);
    return Number(result?.result || 0) === 1;
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.expiresAt <= now()) {
    memoryStore.delete(key);
    return false;
  }
  return true;
}
