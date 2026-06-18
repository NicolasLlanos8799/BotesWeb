#!/usr/bin/env node
/**
 * test-gyg.js — GYG Supplier API Integration Test
 *
 * Simulates exactly what GetYourGuide calls against your live Vercel endpoints.
 * Runs the full flow: availability → reserve → book → cancel-booking
 *
 * Usage:
 *   node test-gyg.js
 *   node test-gyg.js --url https://seaduced-experience.com
 *   node test-gyg.js --url https://your-preview.vercel.app
 */

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL  = getArg("--url")  || "https://seaduced-experience.com";
const GYG_USER  = getArg("--user") || process.env.GYG_BASIC_USER;
const GYG_PASS  = getArg("--pass") || process.env.GYG_BASIC_PASS;

// Test with a real product ID from your gyg-config.js
const PRODUCT_ID = "book-1h";

// Tomorrow at 10:00 (safe — won't clash with real bookings at exact test time)
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TEST_DATE = tomorrow.toISOString().split("T")[0];
const TEST_TIME = "10:00";
const GYG_REF   = `GYGTEST${Date.now()}`;   // fake booking reference

// ── Helpers ───────────────────────────────────────────────────────────────────

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

function basicAuth() {
  if (!GYG_USER || !GYG_PASS) {
    console.error("\n❌ Missing credentials.");
    console.error("   Set GYG_BASIC_USER and GYG_BASIC_PASS env vars, or pass --user / --pass flags.");
    process.exit(1);
  }
  return "Basic " + Buffer.from(`${GYG_USER}:${GYG_PASS}`).toString("base64");
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      "Authorization": basicAuth(),
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const start = Date.now();
  let res, json, text;
  try {
    res  = await fetch(url, opts);
    text = await res.text();
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, status: res?.status, error: e.message, raw: text, ms: Date.now() - start };
  }
  return { ok: res.ok, status: res.status, json, ms: Date.now() - start };
}

function pass(label, detail = "") {
  console.log(`  ✅ ${label}${detail ? "  →  " + detail : ""}`);
}
function fail(label, detail = "") {
  console.log(`  ❌ ${label}${detail ? "  →  " + detail : ""}`);
}
function info(label) {
  console.log(`\n${"─".repeat(55)}\n  ${label}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testAvailability() {
  info("1. GET /1/get-availabilities/");

  const from = `${TEST_DATE}T00:00:00+02:00`;
  const to   = `${TEST_DATE}T23:59:59+02:00`;
  const path = `/api/gyg/1/get-availabilities/?productId=${PRODUCT_ID}&fromDateTime=${encodeURIComponent(from)}&toDateTime=${encodeURIComponent(to)}`;

  const r = await request("GET", path);
  console.log(`  HTTP ${r.status}  (${r.ms}ms)`);

  if (!r.json) return fail("No JSON response", r.error || r.raw?.slice(0, 200));

  if (r.json.errorCode) return fail("API error", r.json.errorCode + ": " + r.json.errorMessage);

  const avails = r.json?.data?.availabilities;
  if (!Array.isArray(avails)) return fail("Missing data.availabilities array", JSON.stringify(r.json).slice(0, 200));

  pass(`Got ${avails.length} slots for ${TEST_DATE}`);

  const slot = avails.find(a => a.dateTime?.includes("T10:00:"));
  if (!slot) {
    fail("10:00 slot not found in response");
    console.log("  Sample slots:", avails.slice(0, 3).map(a => a.dateTime));
    return false;
  }

  pass(`10:00 slot found`, `vacancies=${slot.vacancies}, currency=${slot.currency}`);

  if (!slot.pricesByCategory?.retailPrices?.length) {
    fail("Missing pricesByCategory.retailPrices");
    return false;
  }
  pass("Prices present", slot.pricesByCategory.retailPrices.map(p => `${p.category}=${p.price}`).join(", "));

  if (typeof slot.cutoffSeconds !== "number") fail("cutoffSeconds missing or not a number");
  else pass("cutoffSeconds present", slot.cutoffSeconds + "s");

  return slot.vacancies > 0;
}

async function testReserve() {
  info("2. POST /1/reserve/");

  const r = await request("POST", "/api/gyg/1/reserve/", {
    data: {
      productId: PRODUCT_ID,
      dateTime: `${TEST_DATE}T${TEST_TIME}:00+02:00`,
      bookingItems: [{ category: "ADULT", count: 2 }],
      gygBookingReference: GYG_REF,
    },
  });
  console.log(`  HTTP ${r.status}  (${r.ms}ms)`);

  if (r.json?.errorCode) return fail("API error", r.json.errorCode + ": " + r.json.errorMessage), false;

  const ref  = r.json?.data?.reservationReference;
  const exp  = r.json?.data?.reservationExpiration;

  if (!ref) return fail("Missing data.reservationReference", JSON.stringify(r.json).slice(0, 300)), false;
  if (!exp) return fail("Missing data.reservationExpiration", JSON.stringify(r.json).slice(0, 300)), false;

  pass("reservationReference received", ref);
  pass("reservationExpiration received", exp);

  // Validate expiration is ~1h ahead
  const expDate = new Date(exp);
  const diffMin = (expDate - Date.now()) / 60000;
  if (diffMin < 50 || diffMin > 70) {
    fail(`Expiration should be ~60 min ahead, got ${Math.round(diffMin)} min`);
  } else {
    pass("Expiration is ~60 min ahead", `${Math.round(diffMin)} min`);
  }

  return true;
}

async function testBook() {
  info("3. POST /1/book/");

  const r = await request("POST", "/api/gyg/1/book/", {
    data: {
      productId: PRODUCT_ID,
      dateTime: `${TEST_DATE}T${TEST_TIME}:00+02:00`,
      reservationReference: GYG_REF,
      gygBookingReference: GYG_REF,
      currency: "DKK",
      bookingItems: [
        { category: "ADULT", count: 2, retailPrice: 249900 },
      ],
      travelers: [
        {
          firstName: "GYG",
          lastName: "Test",
          email: "gyg-test@seaduced-experience.com",
          phoneNumber: "+45 00 00 00 00",
        },
      ],
      comment: "Automated integration test — safe to ignore",
    },
  });
  console.log(`  HTTP ${r.status}  (${r.ms}ms)`);

  if (r.json?.errorCode) return fail("API error", r.json.errorCode + ": " + r.json.errorMessage), false;

  const bookingRef = r.json?.data?.bookingReference;
  const tickets    = r.json?.data?.tickets;

  if (!bookingRef) return fail("Missing data.bookingReference", JSON.stringify(r.json).slice(0, 300)), false;
  pass("bookingReference received", bookingRef);

  if (!Array.isArray(tickets) || tickets.length === 0) {
    fail("Missing or empty data.tickets[]");
    return false;
  }
  pass(`tickets[] received`, `${tickets.length} ticket(s): ` + tickets.map(t => t.category).join(", "));

  const missingFields = tickets.filter(t => !t.ticketCode || !t.ticketCodeType);
  if (missingFields.length) fail("Some tickets missing ticketCode or ticketCodeType");
  else pass("All tickets have ticketCode + ticketCodeType");

  return true;
}

async function testCancelBooking() {
  info("4. POST /1/cancel-booking/  (cleanup)");

  const r = await request("POST", "/api/gyg/1/cancel-booking/", {
    data: {
      bookingReference: GYG_REF,
      gygBookingReference: GYG_REF,
      productId: PRODUCT_ID,
    },
  });
  console.log(`  HTTP ${r.status}  (${r.ms}ms)`);

  if (r.json?.errorCode) return fail("API error", r.json.errorCode + ": " + r.json.errorMessage), false;

  const status = r.json?.data?.status;
  if (status !== "cancelled") return fail("Expected status=cancelled", JSON.stringify(r.json).slice(0, 200)), false;

  pass("Booking cancelled successfully");
  return true;
}

async function testAuthFailure() {
  info("5. Auth check — bad credentials should return AUTHORIZATION_FAILURE");

  const url  = `${BASE_URL}/api/gyg/1/get-availabilities/?productId=${PRODUCT_ID}&fromDateTime=2025-01-01T00:00:00%2B02:00&toDateTime=2025-01-01T23:59:59%2B02:00`;
  const res  = await fetch(url, {
    headers: { "Authorization": "Basic " + Buffer.from("wrong:credentials").toString("base64") },
  });
  const json = await res.json().catch(() => null);

  if (json?.errorCode === "AUTHORIZATION_FAILURE") pass("AUTHORIZATION_FAILURE returned correctly");
  else fail("Expected AUTHORIZATION_FAILURE", JSON.stringify(json).slice(0, 200));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  GYG Supplier API — Integration Test");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  URL:        ${BASE_URL}`);
  console.log(`  Product:    ${PRODUCT_ID}`);
  console.log(`  Test date:  ${TEST_DATE} ${TEST_TIME}`);
  console.log(`  GYG ref:    ${GYG_REF}`);
  console.log("══════════════════════════════════════════════════════");

  const hasVacancy = await testAvailability();
  if (!hasVacancy) {
    console.log("\n  ⚠️  10:00 slot has 0 vacancies — reserve/book tests will return NO_AVAILABILITY.");
    console.log("     Choose a different TEST_DATE or free up the slot.");
  }

  await testReserve();
  await testBook();
  await testCancelBooking();
  await testAuthFailure();

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Done. Check Google Calendar to verify the HOLD event");
  console.log("  was created (grey) and then deleted after the cancel.");
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
