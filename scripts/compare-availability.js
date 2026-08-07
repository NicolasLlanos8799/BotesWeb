/**
 * scripts/compare-availability.js
 *
 * FASE 2 — VALIDACIÓN. SOLO LECTURA.
 *
 * Compara, día a día y bote a bote, las horas ocupadas según Google Calendar
 * (lo que ve hoy la web) contra las que calcula lib/availability.js desde
 * Postgres (lo que vería después del cambio).
 *
 * Dos tipos de diferencia, con gravedad muy distinta:
 *
 *   🔴 SOBREVENTA  ocupada en Calendar, libre en Postgres.
 *                  Tras el cambio la web vendería un hueco que está cogido.
 *                  Bloqueante: hay que resolverlo antes de desplegar.
 *
 *   🟡 VENTA PERDIDA  libre en Calendar, ocupada en Postgres.
 *                  Tras el cambio se dejaría de vender un hueco que hoy se
 *                  vende. Casi siempre es correcto (reservas que Calendar no
 *                  tenía), pero conviene mirarlo.
 *
 * Uso:
 *   node scripts/compare-availability.js
 *   node scripts/compare-availability.js --days=90
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getBusyByDate } from "../lib/availability.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const m = line.match(/^([^#\s=]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  });
}
function requireEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v || v.includes("[SENSITIVE]")) {
    console.error(`❌ ${name} no válida en .env.local`);
    process.exit(1);
  }
  return v;
}
const GAS_URL = requireEnv("GAS_URL");
requireEnv("POSTGRES_URL");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; })
);
const DAYS = Number(args.days) || 60;

const iso = d => d.toISOString().split("T")[0];
const today = new Date();
const hasta = new Date(today); hasta.setDate(hasta.getDate() + DAYS);

console.log(`\n🔬 Comparando disponibilidad: Google Calendar vs Postgres`);
console.log(`   ${iso(today)} → ${iso(hasta)} (${DAYS} días)\n`);

/* ── Meses a consultar ───────────────────────────────────────────────────── */
const meses = [];
for (let d = new Date(today); d <= hasta; d.setMonth(d.getMonth() + 1)) {
  meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
}

const BOATS = ["boat1", "boat2"];
const problemas = { sobreventa: [], perdida: [] };
let diasComparados = 0;

for (const boat of BOATS) {
  /* Calendar: un fetch por mes */
  const gcal = {};
  for (const mes of meses) {
    const url = `${GAS_URL}?action=getMonthlyAvailability&date=${mes}&calendar=${boat}&t=${Date.now()}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      for (const [fecha, slots] of Object.entries(data || {})) {
        gcal[fecha] = new Set((slots || []).map(s => s.time));
      }
    } catch (err) {
      console.error(`❌ Fallo al pedir ${mes} (${boat}) a GAS: ${err.message}`);
      process.exit(1);
    }
  }

  /* Postgres */
  const pgRaw = await getBusyByDate(boat, iso(today), iso(hasta));
  const pg = {};
  for (const [fecha, slots] of Object.entries(pgRaw)) {
    pg[fecha] = new Set(slots.map(s => s.time));
  }

  /* Diff día a día */
  for (let d = new Date(today); d <= hasta; d.setDate(d.getDate() + 1)) {
    const fecha = iso(d);
    diasComparados++;
    const enCal = gcal[fecha] || new Set();
    const enPg  = pg[fecha]   || new Set();

    for (const h of enCal) if (!enPg.has(h)) problemas.sobreventa.push({ boat, fecha, hora: h });
    for (const h of enPg) if (!enCal.has(h)) problemas.perdida.push({ boat, fecha, hora: h });
  }
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
console.log("═".repeat(72));
console.log(`Días comparados: ${diasComparados / BOATS.length} × ${BOATS.length} botes`);
console.log("═".repeat(72));

if (problemas.sobreventa.length === 0) {
  console.log("\n🔴 SOBREVENTA: ninguna. ✅");
  console.log("   Todo lo que Calendar da por ocupado, Postgres también.");
} else {
  console.log(`\n🔴 SOBREVENTA: ${problemas.sobreventa.length} horas`);
  console.log("   Ocupadas en Calendar pero LIBRES en Postgres. Se venderían encima.\n");
  const porDia = {};
  for (const p of problemas.sobreventa) (porDia[`${p.fecha} ${p.boat}`] ||= []).push(p.hora);
  for (const [k, horas] of Object.entries(porDia).sort()) {
    console.log(`   ${k}  ${horas.sort().join(" ")}`);
  }
  console.log("\n   → Revisad esos eventos en Calendar: son reservas que no llegaron a Postgres.");
  console.log("     Relanzad la migración con el rango que las cubra:");
  console.log("     node scripts/migrate-gcal.js --start=YYYY-MM-DD --end=YYYY-MM-DD");
}

if (problemas.perdida.length === 0) {
  console.log("\n🟡 VENTA PERDIDA: ninguna.");
} else {
  console.log(`\n🟡 VENTA PERDIDA: ${problemas.perdida.length} horas`);
  console.log("   Libres en Calendar pero OCUPADAS en Postgres.");
  console.log("   Normalmente correcto: reservas reales que Calendar nunca tuvo.\n");
  const porDia = {};
  for (const p of problemas.perdida) (porDia[`${p.fecha} ${p.boat}`] ||= []).push(p.hora);
  const entradas = Object.entries(porDia).sort();
  for (const [k, horas] of entradas.slice(0, 40)) {
    console.log(`   ${k}  ${horas.sort().join(" ")}`);
  }
  if (entradas.length > 40) console.log(`   … y ${entradas.length - 40} días más`);
}

console.log("\n" + "═".repeat(72));
if (problemas.sobreventa.length === 0) {
  console.log("✅ VÍA LIBRE para cambiar el front a /api/availability.");
} else {
  console.log("❌ NO DESPLEGAR todavía: resolved primero la sobreventa.");
}
console.log("═".repeat(72) + "\n");

process.exit(problemas.sobreventa.length > 0 ? 1 : 0);
