/**
 * blocked-slots.js
 * Bloqueos manuales de horario por bote (tabla `blocked_slots`).
 *
 * Doble fuente de verdad del sistema:
 *   - Web pública  → lee Google Calendar (evento creado vía GAS)
 *   - GYG          → lee Postgres (este módulo)
 * Por eso un bloqueo SIEMPRE se escribe en ambos sitios (ver api/admin.js).
 */

import db from "./db.js";
import { timeToMinutes, rangesOverlap } from "./gyg-config.js";

/** Crea la tabla si no existe. Idempotente y barato; evita depender de migraciones manuales. */
export async function ensureBlockedSlotsTable() {
  await db`
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id            SERIAL PRIMARY KEY,
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      group_id      UUID NOT NULL,
      block_date    DATE NOT NULL,
      start_time    TIME NOT NULL,
      end_time      TIME NOT NULL,
      boat          VARCHAR(10) NOT NULL,
      reason        VARCHAR(255),
      gcal_event_id VARCHAR(255),
      CONSTRAINT blocked_slots_range_ck CHECK (end_time > start_time)
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_blocked_slots_boat ON blocked_slots (boat, block_date)`;
  await db`CREATE INDEX IF NOT EXISTS idx_blocked_slots_group ON blocked_slots (group_id)`;
}

function toDateKey(value) {
  return value instanceof Date
    ? value.toISOString().split("T")[0]
    : String(value).split("T")[0];
}

/**
 * Bloqueos de un bote en un rango de fechas, indexados por fecha:
 *   { "2026-08-15": [{ startMin, endMin }, ...] }
 * @param {string|null} boat  'boat1' | 'boat2' | null (null → sin bloqueos)
 */
export async function getBlocksByDate(boat, dateFrom, dateTo) {
  if (!boat) return {};
  let rows;
  try {
    const result = await db`
      SELECT block_date, start_time, end_time
      FROM blocked_slots
      WHERE boat = ${boat}
        AND block_date BETWEEN ${dateFrom} AND ${dateTo}
    `;
    rows = result.rows ?? result;
  } catch (err) {
    // Tabla aún no creada en esta BD → sin bloqueos, nunca romper disponibilidad.
    if (/blocked_slots/i.test(err.message) && /exist/i.test(err.message)) return {};
    throw err;
  }

  const byDate = {};
  for (const row of rows) {
    (byDate[toDateKey(row.block_date)] ||= []).push({
      startMin: timeToMinutes(row.start_time),
      endMin: timeToMinutes(row.end_time),
    });
  }
  return byDate;
}

/** True si [startMin, endMin) del día `dateStr` cae dentro de algún bloqueo. */
export function isSlotBlocked(blocksByDate, dateStr, startMin, endMin) {
  const blocks = blocksByDate[dateStr];
  if (!blocks) return false;
  return blocks.some(b => rangesOverlap(startMin, endMin, b.startMin, b.endMin));
}
