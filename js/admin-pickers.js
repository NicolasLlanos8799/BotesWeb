/**
 * Pickers propios del admin (sin controles nativos date/time).
 * Escriben en un <input type="hidden"> y disparan `change`, de modo que el
 * código que ya escuchaba el input nativo sigue funcionando sin cambios.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = n => String(n).padStart(2, "0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function prettyDate(key) {
  if (!key) return "Select a date";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB",
    { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * mountDatePicker(hostId, { inputId, value, allowPast })
 * `hostId` es un contenedor vacío; el input hidden se crea dentro.
 */
export function mountDatePicker(hostId, { inputId, value = "", allowPast = false } = {}) {
  const host = document.getElementById(hostId);
  if (!host) return null;

  let selected = value || "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const init = selected ? new Date(`${selected}T00:00:00`) : today;
  let viewY = init.getFullYear();
  let viewM = init.getMonth();

  host.classList.add("adp");
  host.innerHTML = `
    <input type="hidden" id="${inputId}" value="${selected}">
    <button type="button" class="adp__trigger" data-adp-trigger>
      <span data-adp-label>${prettyDate(selected)}</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    </button>
    <div class="adp__panel" data-adp-panel hidden>
      <div class="adp__head">
        <button type="button" class="adp__nav" data-adp-prev aria-label="Previous month">‹</button>
        <span class="adp__month" data-adp-month></span>
        <button type="button" class="adp__nav" data-adp-next aria-label="Next month">›</button>
      </div>
      <div class="adp__weekdays">${WEEKDAYS.map(w => `<span>${w}</span>`).join("")}</div>
      <div class="adp__grid" data-adp-grid></div>
    </div>
  `;

  const input = host.querySelector(`#${inputId}`);
  const trigger = host.querySelector("[data-adp-trigger]");
  const panel = host.querySelector("[data-adp-panel]");
  const label = host.querySelector("[data-adp-label]");
  const monthEl = host.querySelector("[data-adp-month]");
  const grid = host.querySelector("[data-adp-grid]");

  function render() {
    monthEl.textContent = `${MONTHS[viewM]} ${viewY}`;
    const first = new Date(viewY, viewM, 1);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const days = new Date(viewY, viewM + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < offset; i++) html += `<span class="adp__day adp__day--empty"></span>`;
    for (let d = 1; d <= days; d++) {
      const date = new Date(viewY, viewM, d);
      const key = toKey(date);
      const past = !allowPast && date < today;
      html += `<button type="button" class="adp__day${key === selected ? " is-selected" : ""}${key === toKey(today) ? " is-today" : ""}"
        data-date="${key}" ${past ? "disabled" : ""}>${d}</button>`;
    }
    grid.innerHTML = html;
  }

  const close = () => { panel.hidden = true; };
  const onDocClick = e => { if (!host.contains(e.target)) close(); };

  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) render();
  });
  host.querySelector("[data-adp-prev]").addEventListener("click", () => {
    viewM--; if (viewM < 0) { viewM = 11; viewY--; } render();
  });
  host.querySelector("[data-adp-next]").addEventListener("click", () => {
    viewM++; if (viewM > 11) { viewM = 0; viewY++; } render();
  });
  grid.addEventListener("click", e => {
    const btn = e.target.closest("[data-date]");
    if (!btn || btn.disabled) return;
    selected = btn.dataset.date;
    input.value = selected;
    label.textContent = prettyDate(selected);
    render();
    close();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  document.addEventListener("click", onDocClick);

  render();
  return { input, destroy: () => document.removeEventListener("click", onDocClick) };
}

/**
 * mountSlotPicker(hostId, { inputId, value })
 * Grid de horarios. Se rellena con setSlots([{time, available}], hint).
 */
export function mountSlotPicker(hostId, { inputId, value = "" } = {}) {
  const host = document.getElementById(hostId);
  if (!host) return null;

  let selected = value ? value.substring(0, 5) : "";

  host.classList.add("aslot");
  host.innerHTML = `
    <input type="hidden" id="${inputId}" value="${selected}">
    <div class="aslot__grid" data-aslot-grid>
      <span class="aslot__msg">Select a date first</span>
    </div>
  `;

  const input = host.querySelector(`#${inputId}`);
  const grid = host.querySelector("[data-aslot-grid]");

  grid.addEventListener("click", e => {
    const btn = e.target.closest("[data-time]");
    if (!btn || btn.disabled) return;
    selected = btn.dataset.time;
    input.value = selected;
    grid.querySelectorAll("[data-time]").forEach(b =>
      b.classList.toggle("is-selected", b.dataset.time === selected));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  return {
    input,
    setMessage(msg) {
      grid.innerHTML = `<span class="aslot__msg">${msg}</span>`;
    },
    setSlots(slots) {
      if (!slots.length) return this.setMessage("No slots configured");
      grid.innerHTML = slots.map(s => `
        <button type="button" class="aslot__btn${s.time === selected ? " is-selected" : ""}"
          data-time="${s.time}" ${s.available ? "" : "disabled"}>
          ${s.time}
        </button>`).join("");
    },
    get value() { return input.value; },
    set value(v) { selected = v ? v.substring(0, 5) : ""; input.value = selected; },
  };
}
