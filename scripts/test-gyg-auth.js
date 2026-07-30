#!/usr/bin/env node
/**
 * test-gyg-auth.js — Isolated auth check against the live GYG endpoint.
 * Does NOT create/reserve/cancel bookings — safe to run anytime.
 *
 * Usage:
 *   node scripts/test-gyg-auth.js
 *   node scripts/test-gyg-auth.js --url https://seaduced-experience.com
 *   node scripts/test-gyg-auth.js --user X --pass Y   (test one pair manually)
 */

const BASE_URL = getArg("--url") || "https://seaduced-experience.com";
const PATH = `/api/gyg/1/get-availabilities/?productId=book-1h&fromDateTime=2025-01-01T00:00:00%2B02:00&toDateTime=2025-01-01T23:59:59%2B02:00`;

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

async function tryAuth(label, user, pass) {
  if (!user || !pass) {
    console.log(`  ⚪ ${label}: skipped (not set)`);
    return;
  }
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${PATH}`, { headers: { Authorization: auth } });
  const json = await res.json().catch(() => null);
  const ms = Date.now() - start;

  if (json?.errorCode === "AUTHORIZATION_FAILURE") {
    console.log(`  ❌ ${label}: REJECTED (${ms}ms) — user="${user}"`);
  } else if (json?.data?.availabilities) {
    console.log(`  ✅ ${label}: ACCEPTED (${ms}ms) — user="${user}"`);
  } else {
    console.log(`  ⚠️  ${label}: unexpected response (${ms}ms)`, JSON.stringify(json).slice(0, 150));
  }
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  GYG Auth Check — " + BASE_URL);
  console.log("══════════════════════════════════════════════════════\n");

  const manualUser = getArg("--user");
  const manualPass = getArg("--pass");

  if (manualUser || manualPass) {
    await tryAuth("Manual pair", manualUser, manualPass);
  } else {
    await tryAuth("GYG_BASIC_USER/PASS", process.env.GYG_BASIC_USER, process.env.GYG_BASIC_PASS);
    await tryAuth("GYG_TEST_USER/PASS ", process.env.GYG_TEST_USER, process.env.GYG_TEST_PASS);
  }

  console.log("\nCompara los pares ✅ contra lo que GYG tiene configurado en el");
  console.log("Integrator Portal (Testing + Production). Si ambos salen ❌,");
  console.log("el env var en Vercel no coincide con lo esperado en gyg-config.js,");
  console.log("o el deploy no recogió el cambio (falta redeploy).\n");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
