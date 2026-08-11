/**
 * Sidebar "Notifications" badge — shared by every admin page.
 *
 * Design goal: never poll. Paint instantly from a cached count, only hit
 * the network when the cache is missing/stale, and invalidate the cache
 * the moment an admin action changes a booking (create/edit/cancel/delete)
 * so the badge is event-driven rather than time-driven.
 */
const CACHE_KEY = "sd_admin_notif_badge_v1";
// Safety-net TTL: covers changes we can't know about client-side (e.g. a
// GYG webhook cancelling/creating a booking while this tab is open).
const STALE_MS = 5 * 60 * 1000;

function paint({ count, gygCount }) {
  const allBadge = document.getElementById("notifications-nav-badge");
  if (allBadge) {
    allBadge.textContent = count;
    allBadge.style.display = count > 0 ? "inline-block" : "none";
  }
  const gygBadge = document.getElementById("gyg-nav-badge");
  if (gygBadge) {
    gygBadge.textContent = gygCount;
    gygBadge.style.display = gygCount > 0 ? "inline-block" : "none";
  }
}

function compute(bookings) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const notifications = bookings
    .filter(b => b.createdAt && b.createdAt.getTime() >= cutoff)
    // Drop unconfirmed GYG holds — no customer yet, nothing to act on.
    .filter(b => !(b.status === "RESERVED" && !b.customerEmail));
  const gygCount = notifications.filter(b => b.isGyg && b.status !== "CANCELLED").length;
  return { count: notifications.length, gygCount };
}

/**
 * Call this whenever a page fetches bookings for its own purposes
 * (bookings list, stats, manifest, notifications page…). Reuses that data
 * to paint + cache the badge, so no extra network call is made.
 * Accepts the admin.js-style transformed booking shape:
 * { createdAt: Date, status, customerEmail, isGyg }
 */
export function setBadgesFromBookings(bookings) {
  const result = compute(bookings);
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, ts: Date.now() }));
  } catch { /* sessionStorage unavailable — badge still paints, just not cached */ }
  paint(result);
  return result;
}

/** Drop the cache — call right after any action that changes a booking's status. */
export function invalidateBadgeCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
}

/**
 * Paint instantly from cache if present, then only fetch when the cache is
 * missing or older than STALE_MS. Use on pages that don't otherwise fetch
 * the full, unfiltered booking list themselves (e.g. Calendar, GYG
 * Bookings, Direct Bookings, whose own fetches are scoped/filtered).
 */
export async function ensureBadges() {
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null"); } catch { /* noop */ }

  if (cached) {
    paint(cached);
    if (Date.now() - cached.ts < STALE_MS) return;
  }

  try {
    const res = await fetch("/api/admin/get-bookings");
    if (!res.ok) return;
    const data = await res.json();
    const mapped = (data.bookings || []).map(b => ({
      status: b.payment_status || "PENDING",
      customerEmail: b.customer_email || "",
      createdAt: b.created_at ? new Date(b.created_at) : null,
      isGyg: b.source === "gyg" || (b.customer_email || "").toLowerCase().endsWith("@reply.getyourguide.com"),
    }));
    setBadgesFromBookings(mapped);
  } catch (err) {
    console.error("Error updating notification badges:", err);
  }
}
