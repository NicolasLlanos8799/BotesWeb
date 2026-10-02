import { openBookingDetailModal } from "./admin-modals.js";
import { TOURS } from "./utils.js";
import { ensureBadges } from "./notifications-badge.js";

/* ── Fetch (same shape as admin.js fetchAllBookings) ─────────────────────── */
async function fetchAllBookings() {
  try {
    const res = await fetch("/api/admin/get-bookings");
    if (!res.ok) throw new Error("Failed to fetch bookings");
    const data = await res.json();
    // Solo mostrar reservas pagadas en el calendario
    return data.bookings.filter(b => b.payment_status === "PAID").map(b => {
      let datePart = "2026-01-01";
      if (b.booking_date) {
        const d = new Date(b.booking_date);
        datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      const timePart = b.booking_time || "00:00:00";
      const email = b.customer_email || "";
      return {
        id: b.id,
        date: datePart,
        time: timePart,
        tourName: (!b.tour_name || /^GYG (Option|Direct Book)/i.test(b.tour_name))
          ? (TOURS[b.tour_id]?.title || b.tour_name || "Unknown Tour")
          : b.tour_name,
        customerName: b.customer_name || "Unknown Customer",
        customerEmail: email,
        customerPhone: b.customer_phone,
        passengers: parseInt(b.passengers) || 0,
        status: b.payment_status || "PENDING",
        price: parseFloat(b.total_price) || 0,
        discountCode: b.discount_code || null,
        discountPercent: b.discount_percent ? parseInt(b.discount_percent) : null,
        calendar: b.tour_id || "N/A",
        boat: b.boat || TOURS[b.tour_id]?.calendar || "boat1",
        lang: b.lang || "english",
        extras: parseInt(b.extras) || 0,
        isGyg: (b.source === "gyg") || email.toLowerCase().endsWith("@reply.getyourguide.com")
      };
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    return [];
  }
}

/* ── Bloqueos manuales de horario ─────────────────────────────────────────── */
async function fetchAllBlocks() {
  try {
    const res = await fetch("/api/admin/get-blocks");
    if (!res.ok) throw new Error("Failed to fetch blocks");
    const data = await res.json();
    return (data.blocks || []).map(b => {
      const d = new Date(b.block_date);
      return {
        isBlock: true,
        id: `block-${b.id}`,
        groupId: b.group_id,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        time: String(b.start_time).slice(0, 5),
        endTime: String(b.end_time).slice(0, 5),
        boat: b.boat,
        reason: b.reason || "",
      };
    });
  } catch (err) {
    console.error("Error fetching blocks:", err);
    return [];
  }
}

/* ── State ────────────────────────────────────────────────────────────────── */
let allBookings = [];
let allBlocks = [];
let view = "week"; // "week" | "month"
let anchorDate = new Date(); // any date within the visible week/month

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function bookingsByDate() {
  const map = {};
  for (const b of [...allBookings, ...allBlocks]) {
    (map[b.date] = map[b.date] || []).push(b);
  }
  for (const k in map) map[k].sort((a, b) => a.time.localeCompare(b.time));
  return map;
}

function blockChip(b) {
  const label = b.reason || "Bloqueado";
  const boatLabel = b.boat === "boat2" ? "B2" : "B1";
  return `<button class="cal-chip cal-chip--block cal-chip--${b.boat}" data-block-group="${b.groupId}" title="Bloqueado ${b.time}–${b.endTime} · ${boatLabel}${b.reason ? " · " + b.reason : ""}">
    <span class="cal-chip__time">${b.time}–${b.endTime} <span class="cal-chip__boat">${boatLabel}</span></span>
    <span class="cal-chip__name">⛔ ${label}</span>
  </button>`;
}

function bookingChip(b) {
  if (b.isBlock) return blockChip(b);
  const cls = `cal-chip ${b.isGyg ? "cal-chip--gyg" : "cal-chip--direct"} cal-chip--${b.boat}`;
  const time = (b.time || "").substring(0, 5);
  const boatLabel = b.boat === "boat2" ? "B2" : "B1";
  return `<button class="${cls}" data-id="${b.id}" title="${b.tourName} — ${boatLabel}">
    <span class="cal-chip__time">${time} <span class="cal-chip__boat">${boatLabel}</span></span>
    <span class="cal-chip__name">${b.customerName}</span>
  </button>`;
}

/* ── Week view ────────────────────────────────────────────────────────────── */
function renderWeek(container, byDate) {
  const start = startOfWeek(anchorDate);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  document.getElementById("cal-range-label").textContent =
    `${days[0].getDate()} ${MONTHS[days[0].getMonth()].slice(0,3)} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()].slice(0,3)} ${days[6].getFullYear()}`;

  container.innerHTML = `
    <div class="cal-week-grid">
      ${days.map((d, i) => {
        const key = toKey(d);
        const items = byDate[key] || [];
        const isToday = key === toKey(new Date());
        return `
          <div class="cal-week-col ${isToday ? "cal-week-col--today" : ""}">
            <div class="cal-week-col__head">
              <span class="cal-week-col__day">${WEEKDAYS[i]} ${d.getDate()}</span>
              ${items.length ? `<span class="cal-count-badge">${items.length}</span>` : ""}
            </div>
            <div class="cal-week-col__body">
              ${items.length ? items.map(bookingChip).join("") : `<span class="cal-empty">libre</span>`}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
}

/* ── Month view ───────────────────────────────────────────────────────────── */
function renderMonth(container, byDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  document.getElementById("cal-range-label").textContent = `${MONTHS[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfWeek(firstOfMonth);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    cells.push(d);
  }

  container.innerHTML = `
    <div class="cal-month-weekdays">
      ${WEEKDAYS.map(w => `<div>${w}</div>`).join("")}
    </div>
    <div class="cal-month-grid">
      ${cells.map(d => {
        const key = toKey(d);
        const items = byDate[key] || [];
        const inMonth = d.getMonth() === month;
        const isToday = key === toKey(new Date());
        const visible = items.slice(0, 2);
        const extra = items.length - visible.length;
        return `
          <div class="cal-month-cell ${inMonth ? "" : "cal-month-cell--muted"} ${isToday ? "cal-month-cell--today" : ""}">
            <div class="cal-month-cell__date">${d.getDate()}${items.length ? `<span class="cal-count-badge" style="margin-left:6px;">${items.length}</span>` : ""}</div>
            <div class="cal-month-cell__items cal-month-cell__items--compact">
              ${visible.map(bookingChip).join("")}
              ${extra > 0 ? `<button type="button" class="cal-more" data-day-key="${key}">+${extra} más</button>` : ""}
            </div>
          </div>`;
      }).join("")}
    </div>
  `;
}

function render() {
  const container = document.getElementById("cal-body");
  const byDate = bookingsByDate();
  if (view === "week") renderWeek(container, byDate);
  else renderMonth(container, byDate);
}

/* ── Day list modal (shown from "+N más") ────────────────────────────────── */
function openDayListModal(dayKey) {
  const existing = document.getElementById("cal-day-modal");
  if (existing) existing.remove();

  const items = [...allBookings, ...allBlocks]
    .filter(b => b.date === dayKey)
    .sort((a, b) => a.time.localeCompare(b.time));
  const dateObj = new Date(`${dayKey}T00:00:00`);
  const label = dateObj.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const modal = document.createElement("div");
  modal.id = "cal-day-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-sheet" style="max-width:400px;">
      <div style="margin-bottom:1rem;">
        <div class="modal-sheet__eyebrow">${items.length} bookings</div>
        <h2 class="modal-sheet__title">${label}</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:60vh;overflow-y:auto;">
        ${items.map(bookingChip).join("")}
      </div>
      <div class="modal-sheet__actions">
        <button id="cal-day-modal-close" class="btn--close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("cal-day-modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  modal.querySelectorAll("[data-id]").forEach(chip => {
    chip.addEventListener("click", () => {
      const booking = allBookings.find(b => String(b.id) === chip.dataset.id);
      if (booking) openBookingModal(booking);
    });
  });
  modal.querySelectorAll("[data-block-group]").forEach(chip => {
    chip.addEventListener("click", () => {
      modal.remove();
      openBlockDetailModal(chip.dataset.blockGroup);
    });
  });
}

/* ── Bloquear horario: crear ─────────────────────────────────────────────── */
const BLOCK_HOURS = Array.from({ length: 15 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`); // 07:00 – 21:00

function openCreateBlockModal() {
  document.getElementById("cal-block-modal")?.remove();
  const today = toKey(new Date());

  const modal = document.createElement("div");
  modal.id = "cal-block-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--wide">
      <div style="margin-bottom:1.25rem;">
        <div class="modal-sheet__eyebrow">Disponibilidad</div>
        <h2 class="modal-sheet__title">Bloquear horario</h2>
      </div>
      <div class="field-stack">
        <div class="field-grid-2">
          <div>
            <label class="field-label" for="blk-from">Desde (fecha)</label>
            <input class="field-input" type="date" id="blk-from" value="${today}" min="${today}">
          </div>
          <div>
            <label class="field-label" for="blk-to">Hasta (fecha)</label>
            <input class="field-input" type="date" id="blk-to" value="${today}" min="${today}">
          </div>
        </div>
        <div class="field-grid-2">
          <div>
            <label class="field-label" for="blk-start">Desde (hora)</label>
            <select class="field-input" id="blk-start">
              ${BLOCK_HOURS.map(h => `<option value="${h}" ${h === "09:00" ? "selected" : ""}>${h}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="field-label" for="blk-end">Hasta (hora)</label>
            <select class="field-input" id="blk-end">
              ${BLOCK_HOURS.concat("22:00").map(h => `<option value="${h}" ${h === "21:00" ? "selected" : ""}>${h}</option>`).join("")}
            </select>
          </div>
        </div>
        <div>
          <label class="field-label">Botes</label>
          <div style="display:flex;gap:1.25rem;padding:0.35rem 0;">
            <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;">
              <input type="checkbox" id="blk-boat1" checked> Bote 1
            </label>
            <label style="display:flex;align-items:center;gap:0.45rem;cursor:pointer;">
              <input type="checkbox" id="blk-boat2" checked> Bote 2
            </label>
          </div>
          <p style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin:0.35rem 0 0;">
            Bloquear un bote afecta a todas sus experiencias, en la web y en GetYourGuide.
          </p>
        </div>
        <div>
          <label class="field-label" for="blk-reason">Motivo (opcional)</label>
          <input class="field-input" type="text" id="blk-reason" placeholder="Mantenimiento, clima, vacaciones…" maxlength="120">
        </div>
      </div>
      <p id="blk-error" style="display:none;color:var(--admin-danger);font-size:0.8rem;margin:1rem 0 0;"></p>
      <div class="modal-sheet__actions">
        <button id="blk-cancel" class="btn--close">Cancelar</button>
        <button id="blk-save" class="btn--danger">Bloquear</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  document.getElementById("blk-cancel").addEventListener("click", close);

  document.getElementById("blk-save").addEventListener("click", async () => {
    const errEl = document.getElementById("blk-error");
    const saveBtn = document.getElementById("blk-save");
    const boats = [];
    if (document.getElementById("blk-boat1").checked) boats.push("boat1");
    if (document.getElementById("blk-boat2").checked) boats.push("boat2");

    const payload = {
      dateFrom: document.getElementById("blk-from").value,
      dateTo: document.getElementById("blk-to").value,
      startTime: document.getElementById("blk-start").value,
      endTime: document.getElementById("blk-end").value,
      boats,
      reason: document.getElementById("blk-reason").value.trim(),
    };

    const fail = msg => { errEl.textContent = msg; errEl.style.display = "block"; };
    if (!payload.dateFrom || !payload.dateTo) return fail("Selecciona las fechas.");
    if (payload.dateFrom > payload.dateTo) return fail("La fecha final no puede ser anterior a la inicial.");
    if (payload.startTime >= payload.endTime) return fail("La hora de fin debe ser posterior a la de inicio.");
    if (boats.length === 0) return fail("Selecciona al menos un bote.");

    errEl.style.display = "none";
    saveBtn.disabled = true;
    saveBtn.textContent = "Bloqueando…";
    try {
      const res = await fetch("/api/admin/create-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Error desconocido");
      close();
      if (result.warning) alert(result.warning);
      await reloadBlocks();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Bloquear";
      fail(err.message);
    }
  });
}

/* ── Bloquear horario: detalle / eliminar ────────────────────────────────── */
function openBlockDetailModal(groupId) {
  document.getElementById("cal-block-detail")?.remove();
  const items = allBlocks.filter(b => b.groupId === groupId).sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) return;

  const first = items[0];
  const dates = [...new Set(items.map(b => b.date))].sort();
  const boats = [...new Set(items.map(b => b.boat))].map(b => b === "boat2" ? "Bote 2" : "Bote 1").join(" + ");
  const rangeLabel = dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]}` : dates[0];

  const modal = document.createElement("div");
  modal.id = "cal-block-detail";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--danger">
      <div style="margin-bottom:1.25rem;">
        <div class="modal-sheet__eyebrow">Horario bloqueado</div>
        <h2 class="modal-sheet__title">${first.reason || "Sin motivo"}</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;font-size:0.88rem;color:rgba(255,255,255,0.8);">
        <div><strong>Fechas:</strong> ${rangeLabel} (${dates.length} día${dates.length > 1 ? "s" : ""})</div>
        <div><strong>Horario:</strong> ${first.time} – ${first.endTime}</div>
        <div><strong>Botes:</strong> ${boats}</div>
      </div>
      <p id="blkd-error" style="display:none;color:var(--admin-danger);font-size:0.8rem;margin:1rem 0 0;"></p>
      <div class="modal-sheet__actions">
        <button id="blkd-close" class="btn--close">Cerrar</button>
        <button id="blkd-delete" class="btn--danger">Desbloquear</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  document.getElementById("blkd-close").addEventListener("click", close);

  document.getElementById("blkd-delete").addEventListener("click", async () => {
    const btn = document.getElementById("blkd-delete");
    btn.disabled = true;
    btn.textContent = "Desbloqueando…";
    try {
      const res = await fetch(`/api/admin/delete-block?groupId=${encodeURIComponent(groupId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Error desconocido");
      close();
      if (result.warning) alert(result.warning);
      await reloadBlocks();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Desbloquear";
      const errEl = document.getElementById("blkd-error");
      errEl.textContent = err.message;
      errEl.style.display = "block";
    }
  });
}

async function reloadBlocks() {
  allBlocks = await fetchAllBlocks();
  render();
}

/* ── Detail modal (shared component with Edit/Resend/Cancel wired in) ───── */
function openBookingModal(booking) {
  const syncLocal = (b) => {
    const idx = allBookings.findIndex(x => String(x.id) === String(b.id));
    if (idx !== -1) allBookings[idx] = b;
    render();
  };
  openBookingDetailModal(booking, {
    onUpdated: syncLocal,
    onCancelled: syncLocal,
    onDeleted: (b) => {
      allBookings = allBookings.filter(x => String(x.id) !== String(b.id));
      render();
    }
  });
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */
function shiftPeriod(delta) {
  if (view === "week") anchorDate.setDate(anchorDate.getDate() + delta * 7);
  else anchorDate.setMonth(anchorDate.getMonth() + delta);
  render();
}

document.getElementById("cal-body").addEventListener("click", e => {
  const moreBtn = e.target.closest(".cal-more[data-day-key]");
  if (moreBtn) {
    openDayListModal(moreBtn.dataset.dayKey);
    return;
  }
  const blockChipEl = e.target.closest("[data-block-group]");
  if (blockChipEl) {
    openBlockDetailModal(blockChipEl.dataset.blockGroup);
    return;
  }
  const chip = e.target.closest("[data-id]");
  if (!chip) return;
  const booking = allBookings.find(b => String(b.id) === chip.dataset.id);
  if (booking) openBookingModal(booking);
});

document.getElementById("cal-prev").addEventListener("click", () => shiftPeriod(-1));
document.getElementById("cal-next").addEventListener("click", () => shiftPeriod(1));
document.getElementById("cal-today").addEventListener("click", () => { anchorDate = new Date(); render(); });

document.getElementById("cal-view-week").addEventListener("click", () => {
  view = "week";
  document.getElementById("cal-view-week").classList.add("active");
  document.getElementById("cal-view-month").classList.remove("active");
  render();
});
document.getElementById("cal-view-month").addEventListener("click", () => {
  view = "month";
  document.getElementById("cal-view-month").classList.add("active");
  document.getElementById("cal-view-week").classList.remove("active");
  render();
});

function renderSkeleton() {
  const container = document.getElementById("cal-body");
  const cols = view === "week" ? 7 : 7;
  const rows = view === "week" ? 1 : 6;
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(${cols}, 1fr);gap:0.75rem;">
      ${Array.from({ length: cols * rows }).map(() => `
        <div class="skeleton-card" style="min-height:${view === "week" ? 260 : 100}px;padding:0.75rem;">
          <div class="skeleton-line skeleton-line--short"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
        </div>
      `).join("")}
    </div>
  `;
}

document.getElementById("cal-block-btn")?.addEventListener("click", openCreateBlockModal);

(async function init() {
  renderSkeleton();
  [allBookings, allBlocks] = await Promise.all([fetchAllBookings(), fetchAllBlocks()]);
  render();
})();

/* ── Sidebar notifications badge (cache-first, shared with js/admin.js) ──── */
ensureBadges();
