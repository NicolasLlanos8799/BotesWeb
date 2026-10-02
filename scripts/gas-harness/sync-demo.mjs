/**
 * Regenerates AppScript-DEMO-BookingWeb.js from AppScript-PROD-BookingWeb.js,
 * keeping DEMO's own CONFIGURATION block. Edit PROD, then run:
 *
 *   node scripts/gas-harness/sync-demo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitConfig } from './config-block.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROD = path.join(ROOT, 'AppScript-PROD-BookingWeb.js');
const DEMO = path.join(ROOT, 'AppScript-DEMO-BookingWeb.js');

const prod = splitConfig(fs.readFileSync(PROD, 'utf8'));
const demo = splitConfig(fs.readFileSync(DEMO, 'utf8'));
const next = prod.before + demo.config + prod.after;

if (next === fs.readFileSync(DEMO, 'utf8')) {
  console.log('DEMO already in sync with PROD.');
} else {
  fs.writeFileSync(DEMO, next);
  console.log('DEMO regenerated from PROD (CONFIGURATION block preserved).');
}
