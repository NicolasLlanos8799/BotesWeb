import { openBookingDetailModal } from "./admin-modals.js";
import { TOURS } from "./utils.js";

/* ── Fetch (same shape as admin.js fetchAllBookings) ─────────────────────── */
async function fetchAllBookings() {
  try {
    const res = await fetch("/api/admin/get-bookings");
    if (!res.ok) throw new Error("Failed to fetch bookings");
    const data = await res.json();
    return data.bookings.map(b => {
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
        tourName: b.tour_name || "Unknown Tour",
        customerName: b.customer_name || "Unknown Customer",
        customerEmail: email,
        customerPhone: b.customer_phone,
        passengers: parseInt(b.passengers) || 0,
        status: b.payment_status || "PENDING",
        price: parseFloat(b.total_price) || 0,
        calendar: b.tour_id || "N/A",
        boat: TOURS[b.tour_id]?.calendar || "boat1",
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

/* ── State ────────────────────────────────────────────────────────────────── */
let allBookings = [];
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
  for (const b of allBookings) {
    (map[b.date] = map[b.date] || []).push(b);
  }
  for (const k in map) map[k].sort((a, b) => a.time.localeCompare(b.time));
  return map;
}

function bookingChip(b) {
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

  const items = allBookings.filter(b => b.date === dayKey).sort((a, b) => a.time.localeCompare(b.time));
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

(async function init() {
  renderSkeleton();
  allBookings = await fetchAllBookings();
  render();
})();
