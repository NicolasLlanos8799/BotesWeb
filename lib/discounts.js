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
      type        VARCHAR(10) NOT NULL DEFAULT 'percent',
      percent     INTEGER CHECK (percent BETWEEN 1 AND 100),
      amount_dkk  INTEGER CHECK (amount_dkk > 0),
      max_uses    INTEGER NOT NULL CHECK (max_uses > 0),
      used_count  INTEGER NOT NULL DEFAULT 0,
      held_count  INTEGER NOT NULL DEFAULT 0,
      expires_at  DATE
    )
  `;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS held_count INTEGER NOT NULL DEFAULT 0`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'percent'`;
  await db`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS amount_dkk INTEGER`;
  await db`ALTER TABLE discount_codes ALTER COLUMN percent DROP NOT NULL`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount_dkk INTEGER`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_hold BOOLEAN NOT NULL DEFAULT FALSE`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_code VARCHAR(40)`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_percent INTEGER`;
  await db`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_redeemed BOOLEAN NOT NULL DEFAULT FALSE`;
  schemaEnsured = true;
}

export function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

const HOLD_MINUTES = 30;

/** Libera las reservas de uso vencidas (checkout abierto y nunca pagado) de un código. */
async function sweepExpiredHolds(code) {
  await db`
    WITH exp AS (
      UPDATE bookings SET discount_hold = FALSE
      WHERE discount_code = ${code} AND discount_hold
        AND payment_status = 'PENDING'
        AND created_at < NOW() - make_interval(mins => ${HOLD_MINUTES})
      RETURNING 1
    )
    UPDATE discount_codes SET held_count = GREATEST(held_count - (SELECT COUNT(*) FROM exp)::int, 0)
    WHERE code = ${code}
  `;
}

/** Libera lo que el mismo cliente dejó reservado en un intento de pago anterior (reintento). */
async function releaseHoldsForEmail(code, email) {
  if (!email) return;
  await db`
    WITH rel AS (
      UPDATE bookings SET discount_hold = FALSE
      WHERE discount_code = ${code} AND discount_hold AND payment_status = 'PENDING'
        AND LOWER(customer_email) = LOWER(${email})
      RETURNING 1
    )
    UPDATE discount_codes SET held_count = GREATEST(held_count - (SELECT COUNT(*) FROM rel)::int, 0)
    WHERE code = ${code}
  `;
}

/** Devuelve la fila del código si hay un uso libre (ni gastado ni reservado por otro pago), si no null. */
export async function findValidDiscount(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  await ensureDiscountSchema();
  await sweepExpiredHolds(code);
  const result = await db`
    SELECT code, type, percent, amount_dkk, max_uses, used_count, expires_at
    FROM discount_codes
    WHERE code = ${code}
      AND used_count + held_count < max_uses
      AND (expires_at IS NULL OR expires_at >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date)
  `;
  return (result.rows ?? result)[0] || null;
}

/**
 * Reserva un uso de forma atómica (un único UPDATE sobre la fila del código: dos pagos
 * simultáneos no pueden tomar el mismo último uso). Devuelve la fila o null si no hay cupo.
 */
export async function acquireDiscountHold(rawCode, email) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  await ensureDiscountSchema();
  await sweepExpiredHolds(code);
  await releaseHoldsForEmail(code, email);
  const result = await db`
    UPDATE discount_codes SET held_count = held_count + 1
    WHERE code = ${code}
      AND used_count + held_count < max_uses
      AND (expires_at IS NULL OR expires_at >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date)
    RETURNING code, type, percent, amount_dkk
  `;
  return (result.rows ?? result)[0] || null;
}

/** Deshace una reserva de uso (el checkout no llegó a crearse). */
export async function releaseDiscountHold(code) {
  await db`UPDATE discount_codes SET held_count = GREATEST(held_count - 1, 0) WHERE code = ${code}`;
}

/** Canje directo y atómico (demo: la reserva nace pagada). Devuelve la fila o null si no hay cupo. */
export async function consumeDiscount(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  await ensureDiscountSchema();
  await sweepExpiredHolds(code);
  const result = await db`
    UPDATE discount_codes SET used_count = used_count + 1
    WHERE code = ${code}
      AND used_count + held_count < max_uses
      AND (expires_at IS NULL OR expires_at >= (NOW() AT TIME ZONE 'Europe/Copenhagen')::date)
    RETURNING code, type, percent, amount_dkk
  `;
  return (result.rows ?? result)[0] || null;
}

/** Total tras el descuento (porcentaje o monto fijo en DKK). */
export function applyDiscount(subtotal, discount) {
  if (discount.type === "amount") return Math.round((subtotal - discount.amount_dkk) * 100) / 100;
  return Math.round(subtotal * (100 - discount.percent)) / 100;
}

/** Un código solo es aplicable si deja un total mayor a 0 (SumUp no cobra 0). */
export function isDiscountApplicable(subtotal, discount) {
  return applyDiscount(subtotal, discount) > 0;
}

/** Campos de metadata/DB que describen el descuento aplicado. */
export function discountMetadata(discount, subtotal) {
  const total = applyDiscount(subtotal, discount);
  return {
    discount_code: discount.code,
    discount_type: discount.type === "amount" ? "amount" : "percent",
    discount_percent: discount.type === "amount" ? "" : String(discount.percent),
    discount_amount_dkk: discount.type === "amount" ? String(discount.amount_dkk) : "",
    discount_amount: String(Math.round((subtotal - total) * 100) / 100),
    total: String(total),
  };
}

/** Subtotal calculado en servidor (precio del tour + extras). null si el tour no existe. */
export function computeSubtotal(tourId, tapas) {
  const tour = TOURS[tourId];
  if (!tour) return null;
  const n = Math.max(0, parseInt(tapas) || 0);
  return tour.price + n * EXTRA_CHARCUTERIE.price;
}

/**
 * Convierte la reserva de uso en uso gastado, una única vez por reserva (idempotente vía
 * bookings.discount_redeemed). Llamar justo después de dejar la reserva en PAID.
 */
export async function redeemDiscountForBooking(sumupId) {
  const claimed = await db`
    UPDATE bookings b SET discount_redeemed = TRUE, discount_hold = FALSE
    FROM (
      SELECT id, discount_hold AS old_hold FROM bookings
      WHERE sumup_id = ${sumupId} AND discount_code IS NOT NULL AND discount_redeemed = FALSE
      FOR UPDATE
    ) o
    WHERE b.id = o.id AND b.discount_redeemed = FALSE
    RETURNING b.discount_code, o.old_hold AS discount_hold
  `;
  const row = (claimed.rows ?? claimed)[0];
  if (row) {
    await db`
      UPDATE discount_codes
      SET used_count = used_count + 1,
          held_count = GREATEST(held_count - ${row.discount_hold ? 1 : 0}, 0)
      WHERE code = ${row.discount_code}
    `;
  }
}
