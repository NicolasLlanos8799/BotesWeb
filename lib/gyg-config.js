/**
 * GYG Integration Config
 * Maps internal tour IDs → GYG Option IDs + slot generation rules
 */

// Internal tour ID → GYG Option ID
export const GYG_OPTION_MAP = {
  "book-1h":              1288168,   // Copenhagen City Highlights (1h)
  "book-winter-captain":  1288168,   // same GYG option
  "book-1h-2h":           1288168,   // same GYG option
  "book-10p":             1919949,   // City Highlights 10 people
  "book-10p-2h":          1919949,
  "book-reffen":          1288188,   // Harbor Extended
  "book-winter":          1288188,
  "book-winter-hygge":    1288188,
  "book-christmas":       1288188,
  "book-land":            1825099,   // Land Tour
  "book-malmo":           1935449,   // Copenhagen to Malmö
  "book-wine":            1826872,   // Wine Tour
  // "book-premium" = Sea Fortress — NOT on GYG yet
};

// GYG Option ID → slot generation rules
// maxGroups = max GROUP tickets per slot (1 = private tour, only 1 group at a time)
// maxPax kept for reference (real boat capacity) but GYG logic uses maxGroups
export const GYG_OPTION_CONFIG = {
  1288168: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 },
  1919949: { maxGroups: 1, maxPax: 10, firstSlot: 9,  lastSlot: 18, intervalH: 1 },
  1288188: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 },
  1825099: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 14, intervalH: 2 },
  1935449: { maxGroups: 1, maxPax: 10, firstSlot: 10, lastSlot: 10, intervalH: 1 },
  1826872: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 },
};

// Dates fully blocked across all GYG products (maintenance, holidays, GYG self-test)
// Format: "YYYY-MM-DD". Add/remove here and redeploy.
// TEMPORARY — Integrator Portal test-phase limit only (per GYG support, 2026-07-09):
// while "book-1h" is the test productId (not yet connected to a live Supplier Portal
// product), the max participants configured for their test scenario is 2.
// Revisit/remove once GYG connects a real live product with its own real capacity.
export const TEST_MAX_PARTICIPANTS = 2;

export const BLOCKED_DATES = [
  "2026-08-15",
  "2026-08-16",
];

// GYG Option ID → all internal tour IDs that map to it
export const GYG_OPTION_TO_TOURS = {};
for (const [tourId, optionId] of Object.entries(GYG_OPTION_MAP)) {
  if (!GYG_OPTION_TO_TOURS[optionId]) GYG_OPTION_TO_TOURS[optionId] = [];
  GYG_OPTION_TO_TOURS[optionId].push(tourId);
}

/**
 * Generate all time slots for a GYG option ID
 * @param {number} optionId
 * @returns {string[]} e.g. ["09:00", "10:00", ...]
 */
export function getSlotsForOption(optionId) {
  const cfg = GYG_OPTION_CONFIG[optionId];
  if (!cfg) return [];
  const slots = [];
  for (let h = cfg.firstSlot; h <= cfg.lastSlot; h += cfg.intervalH) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Validate HTTP Basic Auth against env vars
 * @param {Request} req
 * @returns {boolean}
 */
export function validateGYGAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  const [user, pass] = decoded.split(":");

  // GYG requires distinct credentials for their "testing" and "production" configs
  // in the Integrator Portal, even though both hit this same production endpoint.
  // Accept either pair.
  const credentialPairs = [
    [process.env.GYG_BASIC_USER, process.env.GYG_BASIC_PASS],
    [process.env.GYG_TEST_USER, process.env.GYG_TEST_PASS],
  ];

  return credentialPairs.some(([expectedUser, expectedPass]) => {
    if (!expectedUser || !expectedPass) return false;
    return timingSafeEqual(user || "", expectedUser) && timingSafeEqual(pass || "", expectedPass);
  });
}
