import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// Load .env.local natively in supported Node.js versions
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn('[DB] Failed to load .env.local natively:', err.message);
  }
}

export default sql;

