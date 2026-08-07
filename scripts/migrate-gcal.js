/**
 * scripts/migrate-gcal.js
 *
 * FASE 1 — MIGRACIÓN. Importa a Postgres los eventos de Google Calendar que
 * todavía no están registrados, para que la base de datos pueda pasar a ser la
 * única fuente de disponibilidad (Fase 2).
 *
 * POR DEFECTO NO ESCRIBE NADA. Imprime lo que haría y sale.
 * Para escribir de verdad hay que pasar --execute.
 *
 * Idempotente: cada fila guarda su `gcal_event_id` con índice único, así que
 * correrlo dos veces no duplica. Se puede relanzar sin miedo.
 *
 * Uso:
 *   node scripts/migrate-gcal.js                    # simulacro (dry-run)
 *   node scripts/migrate-gcal.js --execute          # escribe
 *   node scripts/migrate-gcal.js --execute --start=2026-08-07 --end=2028-02-07
 *   node scripts/migrate-gcal.js --rollback         # deshace la importación
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classify, toBookingRow, cphParts } from "../lib/gcal-import.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/* ── .env.local ──────────────────────────────────────────────────────────── */
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
    console.error(`❌ ${name} no válida en .env.local (¿"[SENSITIVE]"? pégala a mano)`);
    process.exit(1);
  }
  return v;
}
const GAS_URL = requireEnv("GAS_URL");
requireEnv("POSTGRES_URL");
const { sql } = await import("@vercel/postgres");

/* ── Args ────────────────────────────────────────────────────────────────── */
const args = Object.fromEntries(
  process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; })
);
const EXECUTE  = args.execute === true;
const ROLLBACK = args.rollback === true;

const today = new Date();
const plus18 = new Date(today); plus18.setMonth(plus18.getMonth() + 18);
const iso = d => d.toISOString().split("T")[0];
const start = args.start || iso(today);
const end   = args.end   || iso(plus18);

/* ── Esquema: columna de trazabilidad + índice único ─────────────────────── */
async function ensureSchema() {
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gcal_event_id VARCHAR(255)`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS boat TEXT`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source VARCHAR(20)`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gyg_booking_id VARCHAR(100)`;
  // Único pero permitiendo NULL: solo aplica a las filas importadas.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_gcal_event_id
    ON bookings (gcal_event_id) WHERE gcal_event_id IS NOT NULL
  `;
}

/* ── Rollback ────────────────────────────────────────────────────────────── */
if (ROLLBACK) {
  await ensureSchema();
  const r = await sql`SELECT COUNT(*)::int AS n FROM bookings WHERE gcal_event_id IS NOT NULL`;
  const n = (r.rows ?? r)[0].n;
  if (!EXECUTE) {
    console.log(`\n↩️  ROLLBACK (simulacro): borraría ${n} filas importadas desde Calendar.`);
    console.log("   Para ejecutarlo: node scripts/migrate-gcal.js --rollback --execute\n");
    process.exit(0);
  }
  const d = await sql`DELETE FROM bookings WHERE gcal_event_id IS NOT NULL`;
  console.log(`\n↩️  Rollback completado: ${d.rowCount ?? n} filas eliminadas.\n`);
  process.exit(0);
}

/* ── 1. Traer eventos ────────────────────────────────────────────────────── */
console.log(`\n${EXECUTE ? "🚀 MIGRACIÓN REAL" : "🧪 SIMULACRO (dry-run) — no se escribe nada"}`);
console.log(`   Rango: ${start} → ${end}\n`);

let events = [];
try {
  const res = await fetch(`${GAS_URL}?action=listAllBookings&start=${start}&end=${end}`);
  const text = await res.text();
  try { events = (JSON.parse(text).events) || []; }
  catch { console.error("❌ GAS no devolvió JSON:", text.slice(0, 300)); process.exit(1); }
} catch (err) {
  console.error("❌ Error al conectar con GAS:", err.message);
  process.exit(1);
}
console.log(`📅 GAS devolvió ${events.length} eventos.`);

await ensureSchema();

/* ── 2. Qué hay ya en Postgres ───────────────────────────────────────────── */
const dbAll = await sql`
  SELECT sumup_id, gyg_booking_id, gcal_event_id FROM bookings
`;
const dbRows = dbAll.rows ?? dbAll;
const yaSumup = new Set(dbRows.map(r => r.sumup_id).filter(Boolean).map(String));
const yaGyg   = new Set(dbRows.map(r => r.gyg_booking_id).filter(Boolean).map(String));
const yaGcal  = new Set(dbRows.map(r => r.gcal_event_id).filter(Boolean).map(String));

/* ── 3. Decidir qué importar ─────────────────────────────────────────────── */
const aImportar = [];
const saltados = { ignorar: 0, yaEnBd: 0, yaImportado: 0 };

for (const ev of events) {
  const c = classify(ev);
  if (c.group === "ignorar") { saltados.ignorar++; continue; }
  if (yaGcal.has(String(ev.id))) { saltados.yaImportado++; continue; }
  if (c.sumupId && yaSumup.has(c.sumupId)) { saltados.yaEnBd++; continue; }
  if (c.gygRef && yaGyg.has(c.gygRef))   { saltados.yaEnBd++; continue; }
  aImportar.push(toBookingRow(ev, c));
}

aImportar.sort((a, b) =>
  a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time));

console.log(`   Saltados: ${saltados.ignorar} bloqueos/holds · ${saltados.yaEnBd} ya en BD · ${saltados.yaImportado} ya importados`);
console.log(`   A importar: ${aImportar.length}\n`);

if (aImportar.length === 0) {
  console.log("✅ Nada que importar. Postgres ya está al día.\n");
  process.exit(0);
}

/* ── 4. Previsualización ─────────────────────────────────────────────────── */
console.log("═".repeat(100));
console.log("FECHA       HORA         BOTE   PAX  ORIGEN  TOUR                     CLIENTE");
console.log("═".repeat(100));
for (const b of aImportar) {
  const marcas = [b._revisar && "⚠️ pax?", b._ambiguo && "≈tour", b._sinDuracion && "⚠️ dur"]
    .filter(Boolean).join(" ");
  console.log(
    `${b.booking_date}  ${b.booking_time}-${b.booking_end_time}  ` +
    `${b.boat.padEnd(6)} ${String(b.passengers).padStart(3)}  ` +
    `${b.source.padEnd(6)}  ${String(b.tour_id).padEnd(23)} ` +
    `${String(b.customer_name).slice(0, 26).padEnd(26)} ${marcas}`
  );
}
console.log("═".repeat(100));

const revisar = aImportar.filter(b => b._revisar);
const ambiguos = aImportar.filter(b => b._ambiguo);
if (revisar.length) {
  console.log(`\n⚠️  ${revisar.length} sin pax en el título → se importan con 1 pasajero. Corregidlas luego en el panel:`);
  for (const b of revisar) console.log(`    ${b.booking_date} ${b.booking_time}  ${b.customer_name}`);
}
if (ambiguos.length) {
  console.log(`\nℹ️  ${ambiguos.length} con tour ambiguo — se elige el primer candidato del bote.`);
  console.log("    No afecta a la ocupación: booking_end_time viene del evento y manda sobre la duración del tour.");
  for (const b of ambiguos) console.log(`    ${b.booking_date} ${b.booking_time}  ${b.tour_id}  (opciones: ${b._candidatos.join(", ")})`);
}

/* ── 5. Escribir ─────────────────────────────────────────────────────────── */
if (!EXECUTE) {
  console.log("\n🧪 SIMULACRO: no se ha escrito nada.");
  console.log("   Si la tabla de arriba es correcta:  node scripts/migrate-gcal.js --execute\n");
  process.exit(0);
}

let ok = 0, dup = 0, err = 0;
for (const b of aImportar) {
  try {
    const r = await sql`
      INSERT INTO bookings (
        tour_id, tour_name, customer_name, customer_email, customer_phone,
        passengers, booking_date, booking_time, booking_end_time, boat,
        total_price, payment_status, lang, source, gyg_booking_id, sumup_id, gcal_event_id
      ) VALUES (
        ${b.tour_id}, ${b.tour_name}, ${b.customer_name}, ${b.customer_email}, ${b.customer_phone},
        ${b.passengers}, ${b.booking_date}, ${b.booking_time}, ${b.booking_end_time}, ${b.boat},
        ${b.total_price}, ${b.payment_status}, ${b.lang}, ${b.source},
        ${b.gyg_booking_id}, ${b.sumup_id}, ${b.gcal_event_id}
      )
      ON CONFLICT (gcal_event_id) WHERE gcal_event_id IS NOT NULL DO NOTHING
    `;
    if (r.rowCount > 0) { ok++; console.log(`  ✓ ${b.booking_date} ${b.booking_time} ${b.customer_name}`); }
    else { dup++; console.log(`  ⟳ ya existía: ${b.gcal_event_id}`); }
  } catch (e) {
    err++;
    console.error(`  ✗ ${b.booking_date} ${b.booking_time} ${b.customer_name}: ${e.message}`);
  }
}

console.log(`\n🏁 Importadas ${ok} · ya existían ${dup} · errores ${err}`);
console.log("   Para deshacer:  node scripts/migrate-gcal.js --rollback --execute\n");
process.exit(err > 0 ? 1 : 0);
