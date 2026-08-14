/**
 * lib/availability.js
 *
 * Horas ocupadas por bote, calculadas desde Postgres.
 *
 * Sustituye a la lectura de Google Calendar (`getAvailability` /
 * `getMonthlyAvailability` en el Apps Script). Reproduce EXACTAMENTE el mismo
 * contrato y la misma forma de contar horas, para que el front no tenga que
 * cambiar su lógica de solape y el cambio se pueda revertir cambiando una URL.
 *
 * Reglas heredadas del Apps Script (deliberadamente idénticas):
 *  - Se ocupa la hora de inicio y todas las siguientes hasta la hora de fin,
 *    SIN incluirla: un evento 10:00–13:00 ocupa 10, 11 y 12.
 *  - Los minutos no cuentan: un evento que acaba a las 13:30 sigue liberando
 *    las 13:00. Replicado a propósito; cambiarlo alteraría la disponibilidad
 *    que ve el cliente respecto a lo que veía con Calendar.
 */

import db from "./db.js";
import { TOUR_CALENDAR } from "./gyg-config.js";

/** Estados que NO ocupan barco. El resto (PAID, PENDING, RESERVED) sí,
 *  salvo PENDING con más de 1h de antigüedad (ver query en getBusyByDate). */
const FREE_STATUSES = ["CANCELLED", "REFUNDED"];

/** Minutos tras los que un PENDING sin pagar deja de bloquear el slot. */
const PENDING_EXPIRY_MINUTES = 60;

const HOUR_RE = /^(\d{1,2})/;

function hourOf(value) {
  const m = HOUR_RE.exec(String(value ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * Extrae "YYYY-MM-DD" de una columna DATE.
 *
 * A propósito NO se usa `value.toISOString()` cuando el driver devuelve un
 * objeto Date: si ese Date se construyó interpretando la columna en hora
 * LOCAL de la máquina (en vez de UTC), toISOString() la retrocede un día en
 * cualquier huso horario adelantado respecto a UTC. Ya causó ese bug exacto
 * una vez (ver diagnose-date-shift.js) — por eso las consultas de este
 * archivo piden `::text` explícito y esta función solo espera strings.
 */
function dateKey(value) {
  if (value instanceof Date) {
    throw new Error(
      "dateKey() recibió un objeto Date — la consulta SQL debe pedir " +
      "la columna con ::text para evitar reinterpretación de zona horaria."
    );
  }
  return String(value).split("T")[0];
}

/**
 * Expande [inicio, fin) a horas enteras, igual que hace el Apps Script.
 * Devuelve [] si el rango es inválido o degenerado.
 */
function expandHours(startTime, endTime) {
  const sh = hourOf(startTime);
  const eh = hourOf(endTime);
  if (sh == null || eh == null) return [];
  const hours = [];
  for (let h = sh; h < eh; h++) hours.push(`${String(h).padStart(2, "0")}:00`);
  return hours;
}

/**
 * Bote real de una reserva.
 * La columna `boat` manda sobre TOUR_CALENDAR: es la que refleja dónde se hizo
 * realmente la salida. Hay reservas (catas de vino importadas de Calendar) cuyo
 * bote real no coincide con el mapeo teórico del tour.
 */
function boatOf(row) {
  if (row.boat === "boat1" || row.boat === "boat2") return row.boat;
  return TOUR_CALENDAR[row.tour_id] || "boat1";
}

/**
 * Horas ocupadas de un bote en un rango de fechas.
 *
 * @param {"boat1"|"boat2"} boat
 * @param {string} dateFrom  "YYYY-MM-DD"
 * @param {string} dateTo    "YYYY-MM-DD" (inclusive)
 * @returns {Promise<Record<string, {time:string, available:false}[]>>}
 *          { "2026-08-07": [{ time:"10:00", available:false }, ...] }
 */
export async function getBusyByDate(boat, dateFrom, dateTo) {
  const byDate = {};
  const push = (date, hours) => {
    if (!hours.length) return;
    const list = (byDate[date] ||= []);
    for (const time of hours) list.push({ time, available: false });
  };

  // 1) Reservas. Se filtra por bote en JS y no en SQL porque el bote puede venir
  //    de la columna `boat` o del mapeo del tour, y esa doble fuente no se
  //    expresa bien en la consulta.
  // ::text explícito en TODAS las columnas de fecha/hora — ver dateKey() más
  // arriba para el motivo. No confiar en que el driver las devuelva como string.
  const res = await db`
    SELECT tour_id, boat,
           booking_date::text AS booking_date,
           booking_time::text AS booking_time,
           booking_end_time::text AS booking_end_time
    FROM bookings
    WHERE booking_date BETWEEN ${dateFrom} AND ${dateTo}
      AND payment_status <> ALL(${FREE_STATUSES})
      AND NOT (payment_status = 'PENDING' AND created_at < NOW() - (${PENDING_EXPIRY_MINUTES} || ' minutes')::interval)
  `;
  for (const row of (res.rows ?? res)) {
    if (boatOf(row) !== boat) continue;
    const end = row.booking_end_time
      ?? `${String((hourOf(row.booking_time) ?? 0) + 1).padStart(2, "0")}:00`;
    push(dateKey(row.booking_date), expandHours(row.booking_time, end));
  }

  // 2) Bloqueos manuales del panel. Si la tabla aún no existe, se ignora: nunca
  //    romper la disponibilidad por una tabla que no se ha creado todavía.
  try {
    const blocks = await db`
      SELECT block_date::text AS block_date,
             start_time::text AS start_time,
             end_time::text AS end_time
      FROM blocked_slots
      WHERE boat = ${boat} AND block_date BETWEEN ${dateFrom} AND ${dateTo}
    `;
    for (const row of (blocks.rows ?? blocks)) {
      push(dateKey(row.block_date), expandHours(row.start_time, row.end_time));
    }
  } catch (err) {
    if (!(/blocked_slots/i.test(err.message) && /exist/i.test(err.message))) throw err;
  }

  // Deduplicar y ordenar: dos reservas solapadas no deben repetir la misma hora.
  for (const date of Object.keys(byDate)) {
    const seen = new Set();
    byDate[date] = byDate[date]
      .filter(s => !seen.has(s.time) && seen.add(s.time))
      .sort((a, b) => a.time.localeCompare(b.time));
  }
  return byDate;
}

/** Equivalente a `getAvailability`: horas ocupadas de un día. */
export async function getDayBusy(boat, date) {
  const byDate = await getBusyByDate(boat, date, date);
  return byDate[date] || [];
}

/** Equivalente a `getMonthlyAvailability`: horas ocupadas de todo el mes de `date`. */
export async function getMonthBusy(boat, date) {
  const [year, month] = date.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return getBusyByDate(boat, first, last);
}
