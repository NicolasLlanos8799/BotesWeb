const REQUIRED_METADATA_FIELDS = ["name", "email", "phone", "date", "time", "tour", "qty", "extras"];

export function maskEmail(email = "") {
  const [local = "", domain = ""] = String(email).split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "***";
  return `***${digits.slice(-3)}`;
}

export function safeMetadataForLogs(metadata = {}) {
  return {
    ...metadata,
    email: maskEmail(metadata.email),
    phone: maskPhone(metadata.phone),
    name: metadata.name ? `${String(metadata.name).slice(0, 1)}***` : undefined
  };
}

export function normalizeMetadata(input = {}) {
  return {
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    date: String(input.date || "").trim(),
    time: String(input.time || "").trim(),
    tour: String(input.tour || input.tourTitle || "").trim(),
    qty: String(input.qty || "").trim(),
    extras: String(input.extras ?? input.tapas ?? "0").trim(),
    calendar: String(input.calendar || "boat1").trim(),
    lang: String(input.lang || "english").trim(),
    total: String(input.total || "").trim()
  };
}

export function validateMetadata(metadata) {
  const missing = REQUIRED_METADATA_FIELDS.filter((field) => !metadata[field]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.date)) {
    return { ok: false, missing: ["date_format"] };
  }
  if (!/^\d{2}:\d{2}$/.test(metadata.time)) {
    return { ok: false, missing: ["time_format"] };
  }

  return { ok: true, missing: [] };
}

export function assertEnv(name, value, extraCheck) {
  if (!value || (extraCheck && !extraCheck(value))) {
    throw new Error(`Missing or invalid environment variable: ${name}`);
  }
}

export function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
