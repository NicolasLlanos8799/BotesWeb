/**
 * scripts/migrate-book-1h-id.js
 * One-off: renombra tour_id "book-1h" -> "city-highlights-1h" en la tabla bookings.
 * Uso:
 *   node scripts/migrate-book-1h-id.js            (usa .env.local, BD demo)
 *   POSTGRES_URL="postgresql://..." node scripts/migrate-book-1h-id.js   (BD prod)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#\s=]+)=(.*)$/);
    if (m) {
      const key = m[1];
      const value = m[2].trim().replace(/^"(.*)"$/, '$1');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

if (!process.env.POSTGRES_URL) {
  console.error('❌  POSTGRES_URL no definida.');
  process.exit(1);
}

const { sql } = await import('@vercel/postgres');

const before = await sql`SELECT COUNT(*) AS n FROM bookings WHERE tour_id = 'book-1h'`;
console.log(`Filas a migrar: ${before.rows[0].n}`);

const result = await sql`
  UPDATE bookings SET tour_id = 'city-highlights-1h' WHERE tour_id = 'book-1h'
`;

const after = await sql`SELECT COUNT(*) AS n FROM bookings WHERE tour_id = 'city-highlights-1h'`;
console.log(`✅  Migradas. Filas con tour_id='city-highlights-1h': ${after.rows[0].n}`);
