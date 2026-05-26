/**
 * scripts/init-db.js
 *
 * Inicializa la tabla `bookings` en la base de datos apuntada por las
 * variables de entorno actuales (POSTGRES_URL).
 *
 * Uso:
 *   # Para la BD de DEMO (usa .env.local):
 *   node scripts/init-db.js
 *
 *   # Para la BD de PRODUCCIÓN (pasa las credenciales inline):
 *   POSTGRES_URL="postgresql://..." node scripts/init-db.js
 *
 * O bien, desde la terminal de Neon (SQL Editor), pega el contenido
 * de db/schema.sql directamente.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Cargar .env.local si existe (solo para ejecución local) ──────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim().replace(/^"(.*)"$/, '$1');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

// ── Validar que hay una URL de BD ────────────────────────────────────────────
const dbUrl = process.env.POSTGRES_URL;
if (!dbUrl) {
  console.error('❌  POSTGRES_URL no está definida.');
  console.error('    Para demo:  asegúrate de tener .env.local con POSTGRES_URL.');
  console.error('    Para prod:  POSTGRES_URL="postgresql://..." node scripts/init-db.js');
  process.exit(1);
}

const env = process.env.APP_ENV || 'demo';
console.log(`\n🗄️  Base de datos: ${env.toUpperCase()}`);
console.log(`    Host: ${dbUrl.split('@')[1]?.split('/')[0] ?? '(oculto)'}\n`);

// ── Importar @vercel/postgres y ejecutar el schema ───────────────────────────
let sql;
try {
  ({ sql } = await import('@vercel/postgres'));
} catch {
  console.error('❌  @vercel/postgres no instalado. Ejecuta: npm install');
  process.exit(1);
}

try {
  console.log('⏳  Creando tabla "bookings" ...');

  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id              SERIAL PRIMARY KEY,
      created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      tour_id         VARCHAR(50),
      tour_name       VARCHAR(255),
      customer_name   VARCHAR(255),
      customer_email  VARCHAR(255),
      customer_phone  VARCHAR(50),
      passengers      INTEGER,
      booking_date    DATE,
      booking_time    TIME,
      total_price     DECIMAL(10, 2),
      payment_status  VARCHAR(20) DEFAULT 'PENDING',
      sumup_id        VARCHAR(100) UNIQUE,
      lang            VARCHAR(20) DEFAULT 'english'
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings (booking_date);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (payment_status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_email    ON bookings (customer_email);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bookings_sumup_id ON bookings (sumup_id);`;

  // Verificar
  const result = await sql`
    SELECT COUNT(*) AS total FROM bookings;
  `;
  console.log(`✅  Tabla "bookings" lista. Filas actuales: ${result.rows[0].total}`);
  console.log(`\n🚀  BD de ${env.toUpperCase()} inicializada correctamente.\n`);

} catch (err) {
  console.error('❌  Error al inicializar la BD:', err.message);
  process.exit(1);
}
