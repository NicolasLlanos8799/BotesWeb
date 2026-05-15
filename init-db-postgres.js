import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// Manual .env.local loader for local execution
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

async function init() {
  try {
    console.log('⏳ Creating "bookings" table in Vercel Postgres...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        tour_id VARCHAR(50),
        tour_name VARCHAR(255),
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        passengers INTEGER,
        booking_date DATE,
        booking_time TIME,
        total_price DECIMAL(10, 2),
        payment_status VARCHAR(20) DEFAULT 'PENDING',
        sumup_id VARCHAR(100) UNIQUE,
        lang VARCHAR(20) DEFAULT 'english'
      );
    `;

    console.log('✅ Table "bookings" checked/created.');
    console.log('🚀 ALL DONE! Your Vercel Postgres database is ready.');
  } catch (err) {
    console.error('❌ Error during initialization:', err.message);
    console.error('Make sure you have run "vercel env pull" to get your local credentials.');
  }
}

init();
