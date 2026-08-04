/**
 * GYG Integration Config
 * Maps internal tour IDs → GYG Option IDs + slot generation rules
 */

// Internal tour ID → GYG Option ID
export const GYG_OPTION_MAP = {
  "city-highlights-1h":   1288168,   // Copenhagen City Highlights (1h)
  "book-winter-captain":  1288168,   // same GYG option
  "book-1h-2h":           1288168,   // same GYG option
  "book-10p":             1919949,   // City Highlights 10 people
  "book-10p-2h":          1919949,
  "city-highlights-3h":   1288188,    // Harbor Extended Reffen
  "book-winter":          1288188,
  "book-winter-hygge":    1288188,
  "book-christmas":       1288188,
  "book-land":            1825099,   // Land Tour
  "book-malmo":           1935449,   // Copenhagen to Malmö
  "book-wine":            1826872,   // Wine Tour
  "city-highlights-4h":   1288216,   // Sea Fortress and Coastal Journey (4h)
};

// GYG Option ID → slot generation rules
// maxGroups = max GROUP tickets per slot (1 = private tour, only 1 group at a time)
// maxPax kept for reference (real boat capacity) but GYG logic uses maxGroups
// Values below verified directly against the GYG Supplier Portal on 2026-07-18 —
// see "Configuración de opciones" / "Disponibilidad y precios" per option.
export const GYG_OPTION_CONFIG = {
  1288168: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 },
  1919949: { maxGroups: 2, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 }, // verified: max 2 groups, group size 6 (portal said 10 before — wrong)
  1288188: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 },
  1825099: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 14, intervalH: 2 },
  1935449: { maxGroups: 1, maxPax: 10, firstSlot: 10, lastSlot: 10, intervalH: 1 },
  1826872: { maxGroups: 2, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 }, // verified: max 2 groups (portal said 1 before — wrong)
  1288216: { maxGroups: 1, maxPax: 6,  firstSlot: 9,  lastSlot: 18, intervalH: 1 }, // Sea Fortress 4h — same slot pattern as Wine Tour
};

// Dates fully blocked across all GYG products (maintenance, holidays, GYG self-test)
// Format: "YYYY-MM-DD". Add/remove here and redeploy.
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
 * Internal tour ID → physical boat.
 * Multiple GYG options (different products) can share the same physical boat —
 * a booking on ANY tour of a given boat must block ALL other tours of that boat
 * for the same date/time, otherwise the boat gets double-booked.
 * Mirrors the `calendar` field in js/utils.js (frontend copy, kept in sync manually).
 */
export const TOUR_CALENDAR = {
  "city-highlights-1h":    "boat1",
  "book-winter-captain":   "boat1",
  "book-1h-2h":            "boat1",
  "city-highlights-3h":    "boat1",
  "book-winter":           "boat1",
  "book-winter-hygge":     "boat1",
  "book-christmas":        "boat1",
  "book-land":             "boat1",
  "city-highlights-4h":    "boat1",
  "book-danish-breakfast": "boat1",
  "book-malmo":            "boat2",
  "book-wine":             "boat2",
  "book-10p":              "boat2",
  "book-10p-2h":           "boat2",
};

// Physical boat capacity: max GROUP tickets that COULD run in parallel on that boat/slot
// — but see SHAREABLE_TOURS below. In practice only Wine Tasting can actually use more
// than 1 of these slots at once; every other tour needs the whole boat to itself.
export const BOAT_MAX_GROUPS = {
  boat1: 1,
  boat2: 2,
};

// Tours that can share their boat with MORE INSTANCES OF THEMSELVES (up to
// BOAT_MAX_GROUPS), e.g. two separate Wine Tasting groups running in parallel.
// Every other tour is exclusive: while it holds the boat, nothing else (not even
// another shareable tour) can be booked in that slot, and it can't be booked itself
// if the boat already has ANY other booking (shareable or not).
const SHAREABLE_TOURS = new Set(["book-wine"]);

/**
 * Given a tourId, returns every tourId that shares its physical boat
 * (used to check cross-product conflicts, not just same-GYG-option conflicts).
 */
export function getBoatTourIds(tourId) {
  const boat = TOUR_CALENDAR[tourId];
  if (!boat) return [tourId];
  return Object.entries(TOUR_CALENDAR)
    .filter(([, b]) => b === boat)
    .map(([id]) => id);
}

/** Returns the physical boat ("boat1"/"boat2") a tourId runs on, or null if unknown. */
export function getBoatForTour(tourId) {
  return TOUR_CALENDAR[tourId] || null;
}

/**
 * How many more bookings of `tourId` can still be made in a slot, given the
 * tour_ids of the bookings that already exist there.
 *  - Empty slot: shareable tours report their full boat capacity, everything
 *    else reports 1 (it needs the whole boat but nobody's using it yet).
 *  - Occupied slot: only room for more if `tourId` is shareable AND every
 *    existing booking there is the exact same tourId (e.g. wine + wine).
 *    Any other mix (wine + 10p, 10p + 10p, malmö + anything) means 0 room.
 */
export function remainingBoatCapacity(existingTourIds, tourId) {
  const boat = TOUR_CALENDAR[tourId];
  if (!boat) return 1;
  const capacity = BOAT_MAX_GROUPS[boat] ?? 1;

  if (existingTourIds.length === 0) {
    return SHAREABLE_TOURS.has(tourId) ? capacity : 1;
  }
  const canShare = SHAREABLE_TOURS.has(tourId) && existingTourIds.every(id => id === tourId);
  return canShare ? Math.max(0, capacity - existingTourIds.length) : 0;
}

// Internal tour ID → duration in hours. Used to compute how long a booking
// occupies its boat when `booking_end_time` isn't set on the row (mirrors the
// `duration` field in js/utils.js, kept in sync manually).
export const TOUR_DURATION_HOURS = {
  "city-highlights-1h":    1,
  "book-winter-captain":   1,
  "book-1h-2h":            2,
  "city-highlights-3h":    3,
  "book-winter":           2,
  "book-winter-hygge":     2,
  "book-christmas":        2,
  "book-land":             5,
  "city-highlights-4h":    4,
  "book-danish-breakfast": 1,
  "book-malmo":            7,
  "book-wine":             2,
  "book-10p":              1,
  "book-10p-2h":           2,
};

export function getTourDurationHours(tourId) {
  return TOUR_DURATION_HOURS[tourId] ?? 1;
}

/** "HH:MM" or "HH:MM:SS" (string or Date/time-like) → minutes since midnight. */
export function timeToMinutes(value) {
  const str = typeof value === "string" ? value : String(value);
  const [h, m] = str.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Returns [startMinutes, endMinutes) a booking row occupies on its boat.
 * Uses booking_end_time if set, otherwise falls back to the tour's known duration.
 */
export function getBookingRangeMinutes(row) {
  const start = timeToMinutes(row.booking_time);
  const end = row.booking_end_time
    ? timeToMinutes(row.booking_end_time)
    : start + getTourDurationHours(row.tour_id) * 60;
  return [start, end];
}

/** True if [startA, endA) overlaps [startB, endB) — touching endpoints don't count. */
export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
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
    ["BASIC", process.env.GYG_BASIC_USER, process.env.GYG_BASIC_PASS],
    ["TEST", process.env.GYG_TEST_USER, process.env.GYG_TEST_PASS],
  ];

  return credentialPairs.some(([, expectedUser, expectedPass]) => {
    if (!expectedUser || !expectedPass) return false;
    return timingSafeEqual(user || "", expectedUser) && timingSafeEqual(pass || "", expectedPass);
  });
}
