/**
 * lib/gcal-import.js
 *
 * Parseo y clasificación de eventos de Google Calendar (vía GAS listAllBookings).
 * Compartido por scripts/audit-gcal.js y scripts/migrate-gcal.js para que la
 * auditoría y la migración no puedan divergir.
 *
 * Solo se usa desde scripts de migración — no forma parte del runtime.
 */

import { TOUR_CALENDAR, TOUR_DURATION_HOURS, TOUR_TITLES } from "./gyg-config.js";

/* ── Fecha y hora en horario de Copenhague, nunca en UTC ─────────────────── */
const CPH = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Copenhagen",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

/** ISO → { date: "YYYY-MM-DD", time: "HH:MM" } en hora local de Copenhague. */
export function cphParts(isoString) {
  const [date, time] = CPH.format(new Date(isoString)).split(" ");
  return { date, time: time.slice(0, 5) };
}

/** Lee "Etiqueta: valor" de la descripción. Devuelve null si falta o es "N/A". */
export function field(desc, label) {
  const line = (desc || "").split("\n").map(l => l.trim()).find(l => l.startsWith(label));
  if (!line) return null;
  const value = line.slice(label.length).trim();
  return value && value !== "N/A" ? value : null;
}

/**
 * Título de evento creado a mano. Patrón observado en los calendarios reales:
 *   "Michele Getyourguide 4p 1H"
 *   "Daniel Getyourguide 7P 3H"
 *   "Elvira getyourguide 4p2h winetasting."   ← sin espacio entre pax y horas
 *   "Amit Paginaweb 3 h"                      ← sin pax
 */
export function parseManualTitle(title) {
  const t = (title || "").trim();
  // Lookahead en vez de \b: tras la "p" puede venir directamente el dígito de las horas.
  const pax = t.match(/(\d+)\s*p(?:ax|ers?(?:onas?)?)?(?![a-z])/i);
  const horas = t.match(/(\d+)\s*(?:h|hour|hora)s?(?![a-z])/i);
  const origen = /getyourguide|gyg/i.test(t) ? "gyg"
               : /paginaweb|p[áa]gina\s*web|web/i.test(t) ? "web"
               : null;
  // Nombre = todo lo anterior a la primera palabra reconocida (origen, pax u horas)
  const cut = t.search(/\b(getyourguide|gyg|paginaweb|p[áa]gina|web|\d+\s*p|\d+\s*h)/i);
  const nombre = (cut > 0 ? t.slice(0, cut) : t.split(/\s+/)[0]).trim().replace(/[.,;–-]+$/, "");

  return {
    nombre: nombre || null,
    pax: pax ? Number(pax[1]) : null,
    horas: horas ? Number(horas[1]) : null,
    origen,
  };
}

/**
 * Tours compatibles con un bote y una duración dados.
 * La duración del evento es lo que determina cuántos slots ocupa, así que es
 * mucho más fiable que asumir un tour fijo por calendario.
 */
export function guessTourIds(boat, durationHours) {
  return Object.keys(TOUR_CALENDAR).filter(
    id => TOUR_CALENDAR[id] === boat && (TOUR_DURATION_HOURS[id] ?? 1) === durationHours
  );
}

/** Cualquier tour de ese bote — último recurso cuando la duración no encaja. */
export function anyTourForBoat(boat) {
  return Object.keys(TOUR_CALENDAR).find(id => TOUR_CALENDAR[id] === boat) || null;
}

/**
 * Clasifica un evento en uno de cuatro grupos:
 *   ignorar      → bloqueo del panel o hold temporal de GYG. Ya gestionados.
 *   parseable    → descripción generada por el sistema, con datos de cliente.
 *   manual-opaco → creado a mano; solo se puede sacar del título.
 * (el grupo "ya-en-bd" lo decide quien llama, cruzando contra Postgres)
 */
export function classify(ev) {
  const desc = ev.description || "";
  const title = ev.title || "";

  if (desc.includes("BLOCK_GROUP:") || /^⛔\s*BLOQUEADO/.test(title)) {
    return { group: "ignorar", motivo: "bloqueo del panel" };
  }
  if (/GYG HOLD/i.test(title) || desc.includes("GYG HOLD")) {
    return { group: "ignorar", motivo: "hold temporal GYG" };
  }

  const sumupId = field(desc, "SumUp ID:");
  const gygRef  = field(desc, "GYG Ref:");
  const hasStructure =
    sumupId || gygRef || desc.includes("👥 Passengers:") || /^Reserva:/i.test(title);

  return {
    group: hasStructure ? "parseable" : "manual-opaco",
    motivo: hasStructure ? "descripción del sistema" : "creado a mano",
    sumupId, gygRef,
  };
}

/**
 * Convierte un evento en la fila de `bookings` que le corresponde.
 *
 * Decisiones deliberadas:
 *  - `boat` sale del calendario donde está el evento, NO de TOUR_CALENDAR.
 *    Calendar es donde quedó registrada la salida real; el mapeo puede estar
 *    desactualizado (hay catas de vino en boat1 aunque el mapeo diga boat2).
 *  - `booking_end_time` se fija desde el fin del evento. Así la ocupación es
 *    exacta aunque el tour_id no sea el correcto: getBookingRangeMinutes()
 *    prioriza booking_end_time sobre la duración teórica del tour.
 *  - `tour_id` NUNCA queda a null: la consulta de disponibilidad de GYG filtra
 *    por `tour_id = ANY(tours del bote)`, y una fila sin tour_id sería invisible
 *    para ella — GYG vendería encima.
 */
export function toBookingRow(ev, classification) {
  const { date, time } = cphParts(ev.start);
  const end = cphParts(ev.end);
  const durationHours = Math.round(((new Date(ev.end) - new Date(ev.start)) / 3600000) * 100) / 100;
  const boat = ev.calendar === "boat2" ? "boat2" : "boat1";

  const candidatos = guessTourIds(boat, durationHours);
  const tourId = candidatos[0] || anyTourForBoat(boat);

  const esManual = classification.group === "manual-opaco";
  const manual = esManual ? parseManualTitle(ev.title) : null;

  const emailDesc = field(ev.description, "Email:");
  const esGyg = classification.group === "parseable"
    ? Boolean(classification.gygRef || (emailDesc || "").toLowerCase().endsWith("@reply.getyourguide.com"))
    : manual?.origen === "gyg";

  const paxDesc = field(ev.description, "👥 Passengers:") || field(ev.description, "Passengers:");
  const passengers = esManual
    ? (manual.pax ?? 1)                 // sin pax en el título → 1, marcado para revisar
    : (parseInt(String(paxDesc || "").replace(/\D/g, ""), 10) || 1);

  const importeRaw = field(ev.description, "Amount:");
  const totalPrice = importeRaw ? parseFloat(String(importeRaw).replace(/[^\d.]/g, "")) || 0 : 0;

  const nombreEvento = (ev.title || "").match(/^(?:Reserva|Reservation|GYG):\s*(.+)/i);
  const customerName =
    field(ev.description, "Name:") ||
    (nombreEvento ? nombreEvento[1].trim() : null) ||
    manual?.nombre ||
    "Sin nombre (importado)";

  const tourLine = (ev.description || "").split("\n").map(l => l.trim()).find(l => l.startsWith("✨"));
  const tourName = tourLine ? tourLine.replace("✨", "").trim() : (TOUR_TITLES[tourId] || null);

  return {
    gcal_event_id:    ev.id,
    tour_id:          tourId,
    tour_name:        tourName,
    customer_name:    customerName,
    customer_email:   emailDesc,
    customer_phone:   field(ev.description, "Phone:"),
    passengers,
    booking_date:     date,
    booking_time:     time,
    booking_end_time: end.time,
    boat,
    total_price:      totalPrice,
    payment_status:   "PAID",          // está en el calendario ⇒ ocupa el barco
    lang:             (field(ev.description, "🌍 Language:") || field(ev.description, "Language:") || "english").toLowerCase(),
    source:           esGyg ? "gyg" : "web",
    gyg_booking_id:   classification.gygRef || null,
    sumup_id:         classification.sumupId || null,
    // Metadatos para revisión posterior, no van a la BD
    _revisar:         esManual && manual.pax == null,
    _ambiguo:         candidatos.length > 1,
    _sinDuracion:     candidatos.length === 0,
    _durationHours:   durationHours,
    _candidatos:      candidatos,
  };
}
