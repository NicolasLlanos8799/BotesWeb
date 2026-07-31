/**
 * scripts/import-from-gas.js
 *
 * Importa reservas existentes de Google Calendar (via GAS) a Postgres.
 * Parsea la descripción de cada evento para extraer los datos estructurados.
 * Es idempotente — ON CONFLICT (sumup_id) DO NOTHING.
 *
 * Uso:
 *   node scripts/import-from-gas.js
 *   node scripts/import-from-gas.js --start=2025-01-01 --end=2026-12-31
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Cargar .env.local ────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#\s=]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  });
}

const GAS_URL      = process.env.GAS_URL;
const POSTGRES_URL = process.env.POSTGRES_URL;

if (!GAS_URL)      { console.error('❌ GAS_URL no definida'); process.exit(1); }
if (!POSTGRES_URL) { console.error('❌ POSTGRES_URL no definida'); process.exit(1); }

// ── Args opcionales: --start y --end ────────────────────────────────────────
const args  = Object.fromEntries(process.argv.slice(2).map(a => a.replace('--','').split('=')));
const start = args.start || `${new Date().getFullYear()}-01-01`;
const end   = args.end   || `${new Date().getFullYear()}-12-31`;

let sql;
try {
  ({ sql } = await import('@vercel/postgres'));
} catch {
  console.error('❌ @vercel/postgres no instalado. Ejecuta: npm install');
  process.exit(1);
}

console.log(`\n📥 Importando reservas desde GAS (${start} → ${end})...\n`);

// ── 1. Traer eventos del GAS ─────────────────────────────────────────────────
let events = [];
try {
  const res  = await fetch(`${GAS_URL}?action=listAllBookings&start=${start}&end=${end}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    console.error('❌ GAS no devolvió JSON. Respuesta:', text.slice(0, 300));
    process.exit(1);
  }
  events = data.events || [];
  console.log(`✅ GAS devolvió ${events.length} eventos.\n`);
} catch (err) {
  console.error('❌ Error al conectar con GAS:', err.message);
  process.exit(1);
}

if (events.length === 0) {
  console.log('ℹ️  No hay eventos en ese rango de fechas.');
  process.exit(0);
}

// ── 2. Parsear descripción de cada evento ────────────────────────────────────
// Formato de la descripción generada por el GAS:
//   ✨ TOUR NAME
//   📅 2026-05-01 | 🕒 10:00
//   👥 Passengers: 4
//   🌍 Language: english
//   🍷 Extras: None
//   👤 CONTACT
//   Name: John Doe
//   Email: john@example.com
//   Phone: +45 12345678
//   ──────────────────────────
//   SumUp ID: sup_xxx
//   Amount: 2499 DKK
//   Status: PAID

function parseDescription(desc, event) {
  const lines = (desc || '').split('\n').map(l => l.trim());
  const get   = (label) => {
    const line = lines.find(l => l.startsWith(label));
    return line ? line.replace(label, '').trim() : null;
  };

  // Date & time from calendar event start (more reliable than description)
  const startDate = new Date(event.start);
  const bookingDate = startDate.toISOString().split('T')[0];
  const bookingTime = startDate.toTimeString().slice(0, 5); // HH:MM

  // Tour name — first non-empty line after ✨
  const tourLine = lines.find(l => l.startsWith('✨'));
  const tourName = tourLine ? tourLine.replace('✨', '').trim() : null;

  // Customer name from event title "Reserva: John Doe"
  const titleMatch = (event.title || '').match(/^Reserva:\s*(.+)/i);
  const customerName = titleMatch ? titleMatch[1].trim() : get('Name:');

  const sumupId = get('SumUp ID:') || get('SumUp ID');
  const amountRaw = get('Amount:') || get('Amount');
  const amountNum = amountRaw ? parseFloat(amountRaw.replace(/[^\d.]/g, '')) : 0;
  const status = get('Status:') || get('Status') || 'PAID';
  const passengersRaw = get('Passengers:') || get('👥 Passengers:') || '1';
  const passengers = parseInt(passengersRaw.replace(/[^\d]/g, '')) || 1;

  // Map calendar ID to tour_id
  const calendarToTourId = {
    boat1: 'city-highlights-1h',
    boat2: 'book-malmo',
  };

  return {
    tour_id:        calendarToTourId[event.calendar] || event.calendar || null,
    tour_name:      tourName,
    customer_name:  customerName || get('Name:'),
    customer_email: get('Email:'),
    customer_phone: get('Phone:'),
    passengers,
    booking_date:   bookingDate,
    booking_time:   bookingTime,
    total_price:    amountNum,
    payment_status: status.toUpperCase() === 'PAID' ? 'PAID' : status.toUpperCase(),
    sumup_id:       (sumupId && sumupId !== 'N/A') ? sumupId : `gas_import_${event.id}`,
    lang:           get('Language:') || get('🌍 Language:') || 'english',
  };
}

// ── 3. Insertar en Postgres ──────────────────────────────────────────────────
let imported = 0, skipped = 0, errors = 0;

for (const event of events) {
  const b = parseDescription(event.description, event);

  try {
    const result = await sql`
      INSERT INTO bookings
        (tour_id, tour_name, customer_name, customer_email, customer_phone,
         passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang)
      VALUES
        (${b.tour_id}, ${b.tour_name}, ${b.customer_name}, ${b.customer_email}, ${b.customer_phone},
         ${b.passengers}, ${b.booking_date}, ${b.booking_time}, ${b.total_price},
         ${b.payment_status}, ${b.sumup_id}, ${b.lang})
      ON CONFLICT (sumup_id) DO NOTHING
    `;

    if (result.rowCount > 0) {
      imported++;
      console.log(`  ✓ ${b.customer_name || '?'} — ${b.booking_date} ${b.booking_time} (${b.tour_name || b.tour_id})`);
    } else {
      skipped++;
      console.log(`  ⟳ Ya existía: ${b.sumup_id}`);
    }
  } catch (err) {
    errors++;
    console.error(`  ✗ Error (${b.sumup_id}):`, err.message);
  }
}

console.log(`\n🏁 Importación completada:`);
console.log(`   Importadas nuevas: ${imported}`);
console.log(`   Ya existían (saltadas): ${skipped}`);
console.log(`   Errores: ${errors}\n`);
