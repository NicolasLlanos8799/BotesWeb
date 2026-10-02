/**
 * discounts.js
 * Códigos de descuento (tabla `discount_codes`) + columnas de trazabilidad en `bookings`.
 * Mismo patrón que blocked-slots.js: esquema creado on-demand, idempotente.
 */

import db from "./db.js";
import { TOURS, EXTRA_CHARCUTERIE } from "../js/utils.js";

let schemaEnsured = false;
export async function ensureDiscountSchema() {
  if (schemaEnsured) return;
  await db`
    CREATE TABLE IF NOT EXISTS discount_codes (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      code        VARCHAR(40) NOT NULL UNIQUE,
      percent     INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
      max_uses    INTEGER NOT NULL CHECK (max_uses > 0),
      used_count  INTEGER NOT NULL DEFAULT 0,
      expires_at  DATE
    )
  `;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code VARCHAR(40)`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_percent INTEGER`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_redeemed BOOLEAN NOT NULL DEFAULT FALSE`;
  schemaEnsured = true;
}

export function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Devuelve la fila del código si es canjeable hoy (no vencido, con usos libres), si no null. */
export async function findValidDiscount(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  await ensureDiscountSchema();
  const result = await db`
    SELECT code, percent, max_uses, used_count, expires_at
    FROM discount_codes
    WHERE code = ${code}
      AND used_count < max_uses
      AND (expires_at IS NULL OR expires_at >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date)
  `;
  return (result.rows ?? result)[0] || null;
}

export function applyPercent(subtotal, percent) {
  return Math.round(subtotal * (100 - percent)) / 100;
}

/** Subtotal calculado en servidor (precio del tour + extras). null si el tour no existe. */
export function computeSubtotal(tourId, tapas) {
  const tour = TOURS[tourId];
  if (!tour) return null;
  const n = Math.max(0, parseInt(tapas) || 0);
  return tour.price + n * EXTRA_CHARCUTERIE.price;
}

/**
 * Cuenta el uso una única vez por reserva (idempotente vía bookings.discount_redeemed).
 * Llamar justo después de dejar la reserva en PAID.
 */
export async function redeemDiscountForBooking(sumupId) {
  const claimed = await db`
    UPDATE bookings SET discount_redeemed = TRUE
    WHERE sumup_id = ${sumupId} AND discount_code IS NOT NULL AND discount_redeemed = FALSE
    RETURNING discount_code
  `;
  const row = (claimed.rows ?? claimed)[0];
  if (row) {
    await db`UPDATE discount_codes SET used_count = used_count + 1 WHERE code = ${row.discount_code}`;
  }
}
