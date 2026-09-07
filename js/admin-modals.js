/**
 * Shared admin modal components — used by both js/admin.js (list pages)
 * and js/admin-calendar.js (calendar detail view), so booking actions
 * (edit, resend, cancel, delete) behave identically everywhere.
 */
import { formatCurrency, TOURS } from "./utils.js";
import { mountDatePicker, mountSlotPicker } from "./admin-pickers.js";
import { invalidateBadgeCache, ensureBadges } from "./notifications-badge.js";

/* ── Button loading state (spinner + disabled) for async actions ────────── */
function withButtonLoading(btn, loadingLabel, task) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.style.cursor = "wait";
  btn.innerHTML = `<span class="btn-spinner"></span> ${loadingLabel}`;
  return Promise.resolve(task()).finally(() => {
    btn.disabled = false;
    btn.style.cursor = "";
    btn.innerHTML = original;
  });
}

/* ── Custom Alert / Confirm (unified modal shell) ───────────────────────── */
export function adminAlert(message, type = "info") {
  return new Promise(resolve => {
    const variant = type === "success" ? "success" : type === "error" ? "danger" : "info";
    const icon  = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
    const el = document.createElement("div");
    el.className = "modal-overlay";
    el.innerHTML = `
      <div class="modal-sheet modal-sheet--${variant}" style="text-align:center;">
        <div style="font-size:2rem;margin-bottom:12px;">${icon}</div>
        <p style="margin:0 0 20px;color:#fff;font-size:0.95rem;line-height:1.6;">${message}</p>
        <button id="adm-alert-ok" class="btn--save">OK</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#adm-alert-ok").addEventListener("click", () => { el.remove(); resolve(); });
  });
}

export function adminConfirm(message, confirmLabel = "Confirm", danger = false) {
  return new Promise(resolve => {
    const variant = danger ? "danger" : "info";
    const el = document.createElement("div");
    el.className = "modal-overlay";
    el.innerHTML = `
      <div class="modal-sheet modal-sheet--${variant}" style="text-align:center;">
        <p style="margin:0 0 24px;color:#fff;font-size:0.95rem;line-height:1.6;">${message}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;">
          <button id="adm-confirm-no" class="btn--close">Cancel</button>
          <button id="adm-confirm-yes" class="${danger ? "btn--danger" : "btn--save"}">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#adm-confirm-yes").addEventListener("click", () => { el.remove(); resolve(true); });
    el.querySelector("#adm-confirm-no").addEventListener("click",  () => { el.remove(); resolve(false); });
  });
}

/**
 * EDIT BOOKING MODAL
 * onSave(updated) -> Promise   called when "Save Changes" is clicked
 * Deletion lives exclusively in the booking detail modal — keeping it out
 * of here so Edit stays a pure "modify" flow, not a modify+destroy one.
 */
export function openEditModal(booking, onSave) {
  const existing = document.getElementById("edit-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "edit-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--wide">
      <div style="margin-bottom:1.5rem;">
        <div class="modal-sheet__eyebrow">${booking.isGyg ? "GetYourGuide" : "Booking"}</div>
        <h2 class="modal-sheet__title">Edit Details</h2>
      </div>
      ${booking.isGyg ? `
        <div style="background:rgba(124,139,255,0.1);border:1px solid rgba(124,139,255,0.3);border-radius:8px;padding:0.65rem 0.85rem;margin-bottom:1.1rem;font-size:0.8rem;line-height:1.5;color:rgba(255,255,255,0.85);">
          <strong style="color:#7c8bff;">⚠ Reserva de GetYourGuide.</strong>
          Esto solo cambia el registro interno — GetYourGuide no se entera del cambio.
          Cambiar <strong>fecha, hora o barco</strong> puede provocar una doble reserva, porque su
          sistema seguirá mostrando el horario viejo como ocupado. El <strong>importe</strong> sí es
          seguro de corregir: es el dato que usan las Analíticas para calcular vuestro ingreso neto.
        </div>
      ` : ""}
      <div id="ed-form-wrap">
      <div class="field-stack">
        <label class="field-label">Name
          <input id="ed-name" value="${booking.customerName || ''}" class="field-input">
        </label>
        <label class="field-label">Email
          <input id="ed-email" value="${booking.customerEmail || ''}" class="field-input">
        </label>
        <label class="field-label">Phone
          <input id="ed-phone" value="${booking.customerPhone || ''}" class="field-input">
        </label>
        <div class="field-label">Date
          <div id="ed-date-host"></div>
        </div>
        <div class="field-label">Start
          <div id="ed-time-host"></div>
        </div>
        <label class="field-label">End
          <input id="ed-endtime" value="${booking.endTime || ''}" placeholder="HH:MM" class="field-input">
        </label>
        <div class="field-grid-2">
          <label class="field-label">Passengers
            <input id="ed-qty" value="${booking.passengers || ''}" type="number" min="1" class="field-input">
          </label>
          <label class="field-label">Charcuterie
            <input id="ed-extras" value="${booking.extras || 0}" type="number" min="0" class="field-input">
          </label>
        </div>
        <div class="field-grid-2">
          <label class="field-label">Amount
            <input id="ed-amount" value="${booking.price ?? ''}" type="number" min="0" step="0.01" class="field-input">
          </label>
          <label class="field-label">Language
            <div class="select-custom">
              <select id="ed-lang" class="field-input">
                <option value="english" ${(booking.lang || 'english') === 'english' ? 'selected' : ''}>English</option>
                <option value="spanish" ${booking.lang === 'spanish' ? 'selected' : ''}>Spanish</option>
                <option value="danish" ${booking.lang === 'danish' ? 'selected' : ''}>Danish</option>
              </select>
            </div>
          </label>
        </div>
        <label class="field-label">Boat
          <div class="select-custom">
            <select id="ed-boat" class="field-input">
              <option value="boat1" ${(booking.boat || TOURS[booking.calendar]?.calendar || 'boat1') === 'boat1' ? 'selected' : ''}>Boat 1</option>
              <option value="boat2" ${(booking.boat || TOURS[booking.calendar]?.calendar) === 'boat2' ? 'selected' : ''}>Boat 2</option>
            </select>
          </div>
        </label>
      </div>
      <div class="modal-sheet__actions">
        <button id="ed-cancel" class="btn--close">Cancel</button>
        <button id="ed-save" class="btn--save">Save Changes</button>
      </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  mountDatePicker("ed-date-host", { inputId: "ed-date", value: booking.date || "", allowPast: true });
  const edSlots = mountSlotPicker("ed-time-host", { inputId: "ed-time", value: booking.time || "" });

  // Slots reales del tour de la reserva, refrescados al cambiar la fecha
  const edDateInput = document.getElementById("ed-date");
  let edReqId = 0;
  const edReloadSlots = async () => {
    const date = edDateInput.value;
    if (!date) return edSlots.setMessage("Select a date first");
    const reqId = ++edReqId;
    edSlots.setMessage("Checking availability…");
    const slots = await fetchAvailableSlots(booking.calendar, date);
    if (reqId !== edReqId) return;
    // El slot actual de la reserva sigue siendo elegible aunque figure ocupado
    edSlots.setSlots(slots.map(s =>
      s.time === (booking.time || "").substring(0, 5) ? { ...s, available: true } : s));
  };
  edDateInput.addEventListener("change", edReloadSlots);
  edReloadSlots();

  document.getElementById("ed-cancel").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  document.getElementById("ed-save").addEventListener("click", async () => {
    const saveBtn = document.getElementById("ed-save");
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    await onSave({
      name: document.getElementById("ed-name").value.trim(),
      email: document.getElementById("ed-email").value.trim(),
      phone: document.getElementById("ed-phone").value.trim(),
      date: document.getElementById("ed-date").value.trim(),
      time: document.getElementById("ed-time").value.trim(),
      endTime: document.getElementById("ed-endtime").value.trim(),
      qty: document.getElementById("ed-qty").value.trim(),
      extras: document.getElementById("ed-extras").value.trim(),
      amount: document.getElementById("ed-amount").value.trim(),
      lang: document.getElementById("ed-lang").value,
      boat: document.getElementById("ed-boat").value
    });

    modal.remove();
  });
}

/**
 * Compute end time (HH:MM) from a start time + the tour's duration.
 */
function computeEndTime(startTime, durationHours) {
  if (!startTime || !durationHours) return "";
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationHours * 60;
  return `${String(Math.floor((total / 60) % 24)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Fetch real-time slot availability for a tour+date, mirroring the public
 * booking widget's logic (js/experience.js) so admin-created bookings can't
 * accidentally double-book a boat or overfill the wine tour.
 * Returns [{ time: "HH:MM", available: bool, groupStatus? }]
 */
async function fetchAvailableSlots(tourId, date) {
  const tourConfig = TOURS[tourId] || {};
  const durationHours = parseInt(tourConfig.duration) || 1;

  // Wine group experience: dedicated per-slot group-count endpoint.
  if (tourConfig.isGroupExperience) {
    try {
      const res = await fetch(`/api/wine-availability/?date=${date}&t=${Date.now()}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      return (tourConfig.customSlots || []).map(s => {
        const info = data[s.time] || { groups: 0, status: "available" };
        return { time: s.time, available: info.status !== "full", groupStatus: info.status };
      });
    } catch {
      return (tourConfig.customSlots || []).map(s => ({ time: s.time, available: true }));
    }
  }

  // Boat tours: shared calendar per boat, read straight from Postgres — see
  // docs/gcal-migration-status.md (Fase 2) and api/availability.js.
  const cal = tourConfig.calendar || "boat1";
  let busySlots = [];
  try {
    const res = await fetch(`/api/availability?action=getAvailability&date=${date}&calendar=${cal}&t=${Date.now()}`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    busySlots = data.busy || (Array.isArray(data) ? data : []);
  } catch {
    busySlots = []; // fail open — better to let the admin see all slots than block the modal
  }

  const maxHour = tourConfig.fixedLastSlot === false ? (19 - durationHours) : 18;

  // A slot is blocked if any busy hour falls inside the full duration window
  // the tour would occupy, not just an exact-time match — same rule the
  // public booking widget uses to avoid overlapping long tours.
  const isRangeBusy = (startTime) => {
    const [sh] = startTime.split(":").map(Number);
    return busySlots.some(sl => {
      if (sl.available !== false) return false;
      const [bh] = sl.time.split(":").map(Number);
      return bh >= sh && bh < sh + durationHours;
    });
  };

  const slots = [];
  if (tourConfig.customSlots) {
    tourConfig.customSlots.forEach(s => slots.push({ time: s.time, available: !isRangeBusy(s.time) }));
  } else {
    const interval = tourConfig.slotInterval || 1;
    for (let h = 9; h <= maxHour; h += interval) {
      const timeStr = `${String(h).padStart(2, "0")}:00`;
      slots.push({ time: timeStr, available: !isRangeBusy(timeStr) });
    }
  }
  return slots;
}

/**
 * CREATE BOOKING MODAL — manual admin entry, always source='web' (Direct).
 * onCreate(payload) -> Promise   called when "Create Booking" is clicked
 */
export function openCreateBookingModal(onCreate) {
  const existing = document.getElementById("create-booking-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "create-booking-modal";
  modal.className = "modal-overlay";

  const tourOptions = Object.values(TOURS)
    .filter(t => !t.hidden)
    .map(t => `<option value="${t.id}" data-price="${t.price}">${t.title}</option>`)
    .join("");

  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--wide">
      <div style="margin-bottom:1.5rem;">
        <div class="modal-sheet__eyebrow">Direct Booking</div>
        <h2 class="modal-sheet__title">New Booking</h2>
      </div>
      <div class="field-stack">
        <label class="field-label">Experience
          <div class="select-custom">
            <select id="cb-tour" class="field-input">${tourOptions}</select>
          </div>
        </label>
        <div class="field-grid-2">
          <label class="field-label">First Name
            <input id="cb-firstname" class="field-input">
          </label>
          <label class="field-label">Last Name
            <input id="cb-lastname" class="field-input">
          </label>
        </div>
        <label class="field-label">Email <span style="opacity:0.5;font-weight:400;">(optional)</span>
          <input id="cb-email" class="field-input">
        </label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.85rem;margin-top:-0.5rem;">
          <input id="cb-send-email" type="checkbox" style="width:auto;margin:0;cursor:pointer;">
          <span>Enviar emails</span>
        </label>
        <label class="field-label">Phone <span style="opacity:0.5;font-weight:400;">(optional)</span>
          <input id="cb-phone" class="field-input">
        </label>
        <div class="field-label">Date
          <div id="cb-date-host"></div>
        </div>
        <div class="field-label">Time
          <div id="cb-time-host"></div>
        </div>
        <div id="cb-time-hint" style="font-size:0.78rem;opacity:0.6;margin-top:-0.5rem;"></div>
        <div class="field-grid-2">
          <label class="field-label">Passengers
            <input id="cb-qty" value="1" type="number" min="1" class="field-input">
          </label>
          <label class="field-label">Charcuterie Extras
            <input id="cb-extras" value="0" type="number" min="0" class="field-input">
          </label>
        </div>
        <div class="field-grid-2">
          <label class="field-label">Amount
            <input id="cb-amount" type="number" min="0" step="0.01" class="field-input">
          </label>
          <label class="field-label">Language
            <div class="select-custom">
              <select id="cb-lang" class="field-input">
                <option value="english" selected>English</option>
                <option value="spanish">Spanish</option>
                <option value="danish">Danish</option>
              </select>
            </div>
          </label>
        </div>
        <label class="field-label">Payment Status
          <div class="select-custom">
            <select id="cb-status" class="field-input">
              <option value="PAID" selected>Paid</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </label>
      </div>
      <div id="cb-error" style="margin-top:0.75rem;color:var(--admin-danger);font-size:0.8rem;display:none;"></div>
      <div class="modal-sheet__actions">
        <button id="cb-cancel" class="btn--close">Cancel</button>
        <button id="cb-save" class="btn--save">Create Booking</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const tourSelect = document.getElementById("cb-tour");
  mountDatePicker("cb-date-host", { inputId: "cb-date" });
  const slotPicker = mountSlotPicker("cb-time-host", { inputId: "cb-time" });
  const dateInput = document.getElementById("cb-date");
  const timeSelect = document.getElementById("cb-time");
  const timeHint = document.getElementById("cb-time-hint");
  const qtyInput = document.getElementById("cb-qty");
  const amountInput = document.getElementById("cb-amount");
  const saveBtn = document.getElementById("cb-save");
  const errEl = document.getElementById("cb-error");

  // Auto-fill amount from tour price × passengers, but only while the admin
  // hasn't manually touched the amount field.
  let amountTouched = false;
  amountInput.addEventListener("input", () => { amountTouched = true; });

  const recalcAmount = () => {
    if (amountTouched) return;
    const price = parseFloat(tourSelect.selectedOptions[0]?.dataset.price || 0) / 100;
    const qty = parseInt(qtyInput.value) || 1;
    amountInput.value = (price * qty).toFixed(2);
  };
  tourSelect.addEventListener("change", recalcAmount);
  qtyInput.addEventListener("input", recalcAmount);
  recalcAmount();

  // Live availability: reload the time dropdown whenever the tour or date
  // changes, so the admin can only pick a slot that's actually free.
  let loadRequestId = 0;
  const reloadSlots = async () => {
    const tourId = tourSelect.value;
    const date = dateInput.value;
    timeHint.textContent = "";

    if (!date) {
      slotPicker.setMessage("Select a date first");
      return;
    }

    const requestId = ++loadRequestId;
    slotPicker.setMessage("Checking availability…");

    const slots = await fetchAvailableSlots(tourId, date);
    if (requestId !== loadRequestId) return; // a newer request superseded this one

    const available = slots.filter(s => s.available);
    slotPicker.setSlots(slots);
    if (slots.length === 0) return;

    if (available.length === 0) {
      timeHint.textContent = "No available time slots for this date.";
      timeHint.style.color = "var(--admin-danger)";
    } else {
      timeHint.textContent = `${available.length} slot${available.length === 1 ? "" : "s"} available.`;
      timeHint.style.color = "";
    }
  };

  tourSelect.addEventListener("change", reloadSlots);
  dateInput.addEventListener("change", reloadSlots);

  document.getElementById("cb-cancel").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  saveBtn.addEventListener("click", async () => {
    // Disable immediately — everything below this line is async (network
    // calls), and without this guard a fast double-click fires two submits
    // before the first one has a chance to disable the button itself.
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Checking availability...";

    errEl.style.display = "none";

    const firstName = document.getElementById("cb-firstname").value.trim();
    const lastName = document.getElementById("cb-lastname").value.trim();
    const email = document.getElementById("cb-email").value.trim();
    const date = dateInput.value.trim();
    const time = timeSelect.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!firstName || !lastName || !date || !time || (email && !emailRegex.test(email))) {
      errEl.textContent = "Please fill in first name, last name, date and time (email must be valid if provided).";
      errEl.style.display = "block";
      saveBtn.textContent = "Create Booking";
      saveBtn.disabled = false;
      return;
    }

    // Defensive re-check right before submit — the slot list could have
    // gone stale if the admin left the modal open for a while.
    const freshSlots = await fetchAvailableSlots(tourSelect.value, date);
    const chosen = freshSlots.find(s => s.time === time);
    if (chosen && !chosen.available) {
      errEl.textContent = "That time slot was just booked. Please choose another.";
      errEl.style.display = "block";
      saveBtn.textContent = "Create Booking";
      saveBtn.disabled = false;
      reloadSlots();
      return;
    }

    const tourConfig = TOURS[tourSelect.value] || {};
    const durationHours = parseInt(tourConfig.duration) || 1;

    saveBtn.textContent = "Creating...";
    saveBtn.disabled = true;

    try {
      await onCreate({
        tourId: tourSelect.value,
        tourName: tourSelect.selectedOptions[0]?.textContent || tourSelect.value,
        name: `${firstName} ${lastName}`,
        email,
        phone: document.getElementById("cb-phone").value.trim(),
        date,
        time,
        endTime: computeEndTime(time, durationHours),
        qty: qtyInput.value.trim(),
        extras: document.getElementById("cb-extras").value.trim(),
        amount: amountInput.value.trim(),
        lang: document.getElementById("cb-lang").value,
        status: document.getElementById("cb-status").value,
        sendEmail: document.getElementById("cb-send-email").checked
      });
      modal.remove();
    } catch (e) {
      errEl.textContent = "Error: " + (e.message || "Could not create booking.");
      errEl.style.display = "block";
      saveBtn.textContent = "Create Booking";
      saveBtn.disabled = false;
    }
  });
}

/**
 * RESEND EMAIL MODAL
 */
export function openResendModal(booking) {
  const existing = document.getElementById("resend-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "resend-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--wide modal-sheet--info">
      <div style="margin-bottom:1.5rem;">
        <div class="modal-sheet__eyebrow" style="color:var(--admin-info);">Email</div>
        <h2 class="modal-sheet__title">Resend Confirmation</h2>
      </div>
      <div class="field-stack">
        <label class="field-label">Name
          <input id="re-name" value="${booking.customerName || ''}" class="field-input">
        </label>
        <label class="field-label">Email
          <input id="re-email" value="${booking.customerEmail || ''}" class="field-input">
        </label>
        <label class="field-label">Phone
          <input id="re-phone" value="${booking.customerPhone || ''}" class="field-input">
        </label>
        <div class="field-grid-2">
          <label class="field-label">Date
            <input id="re-date" value="${booking.date || ''}" class="field-input">
          </label>
          <label class="field-label">Time
            <input id="re-time" value="${(booking.time || '').substring(0, 5)}" class="field-input">
          </label>
        </div>
        <div class="field-grid-2">
          <label class="field-label">Charcuterie Extras
            <input id="re-extras" value="${booking.extras || 0}" type="number" min="0" class="field-input">
          </label>
          <label class="field-label">Language
            <div class="select-custom">
              <select id="re-lang" class="field-input">
                <option value="english" ${(booking.lang || 'english') === 'english' ? 'selected' : ''}>English</option>
                <option value="spanish" ${booking.lang === 'spanish' ? 'selected' : ''}>Spanish</option>
                <option value="danish" ${booking.lang === 'danish' ? 'selected' : ''}>Danish</option>
              </select>
            </div>
          </label>
        </div>
      </div>
      <div id="re-error" style="margin-top:0.75rem;color:var(--admin-danger);font-size:0.8rem;display:none;"></div>
      <div class="modal-sheet__actions">
        <button id="re-cancel" class="btn--close">Cancel</button>
        <button id="re-send" class="btn--save" style="background:var(--admin-info);">✉ Send Email</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("re-cancel").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  document.getElementById("re-send").addEventListener("click", async () => {
    const email = document.getElementById("re-email").value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const err = document.getElementById("re-error");
      err.textContent = "Please enter a valid email address.";
      err.style.display = "block";
      return;
    }

    const sendBtn = document.getElementById("re-send");
    sendBtn.textContent = "Sending...";
    sendBtn.disabled = true;

    const res = await fetch("/api/admin/booking-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("re-name").value.trim(),
        email,
        phone: document.getElementById("re-phone").value.trim(),
        tour: booking.calendar,
        tourTitle: booking.tourName,
        date: document.getElementById("re-date").value.trim(),
        time: document.getElementById("re-time").value.trim(),
        qty: String(booking.passengers),
        lang: document.getElementById("re-lang").value,
        tapas: String(parseInt(document.getElementById("re-extras").value) || 0),
        amount: String(booking.price),
        currency: "DKK",
        sumup_checkout_id: booking.id
      })
    });

    const result = await res.json();
    if (result.success) {
      modal.remove();
      await adminAlert("Email sent successfully!", "success");
    } else {
      const err = document.getElementById("re-error");
      err.textContent = "Error: " + (result.error || "Unknown error");
      err.style.display = "block";
      sendBtn.textContent = "Send Email";
      sendBtn.disabled = false;
    }
  });
}

/**
 * BOOKING DETAIL MODAL — read-only summary + Edit / Resend / Cancel actions.
 * This is the single entry point for "click a booking to see & act on it",
 * used by the calendar, Bookings, and GetYourGuide list pages alike.
 *
 * callbacks (all optional): onUpdated(booking), onDeleted(booking), onCancelled(booking)
 */
export function openBookingDetailModal(booking, { onUpdated, onDeleted, onCancelled } = {}) {
  const existing = document.getElementById("booking-detail-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "booking-detail-modal";
  modal.className = "modal-overlay";

  const sourceLabel = booking.isGyg ? "GetYourGuide" : "Direct (Web)";
  const sourceColor = booking.isGyg ? "#7c8bff" : "var(--admin-accent)";
  const statusVariant = booking.status === "PAID" || booking.status === "CONFIRMED" ? "confirmed"
    : booking.status === "CANCELLED" ? "cancelled" : "pending";

  modal.innerHTML = `
    <div class="modal-sheet" style="max-width:460px;border-top-color:${sourceColor};position:relative;">
      <button id="bd-modal-close" class="modal-close-x" type="button" aria-label="Close dialog">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div style="padding-right:3rem;margin-bottom:1.25rem;">
        <div class="modal-sheet__eyebrow" style="color:${sourceColor};">${sourceLabel}</div>
        <h2 class="modal-sheet__title" style="margin-top:2px;">${booking.customerName}</h2>
        <span class="pill pill--${statusVariant}" style="margin-top:12px;">${booking.status}</span>
      </div>
      <table class="kv-table">
        <tr><td>Tour</td><td>${booking.tourName}</td></tr>
        <tr><td>Date</td><td>${booking.date} · ${(booking.time || "").substring(0,5)}${booking.endTime ? ` – ${booking.endTime}` : ""}</td></tr>
        <tr><td>Passengers</td><td>${booking.passengers}${booking.extras ? ` (+${booking.extras} charcuterie)` : ""}</td></tr>
        <tr><td>Language</td><td>${booking.lang}</td></tr>
        <tr><td>Boat</td><td>${(booking.boat || TOURS[booking.calendar]?.calendar || 'boat1') === 'boat2' ? 'Boat 2' : 'Boat 1'}</td></tr>
        <tr><td>Price</td><td>${formatCurrency(booking.price)}</td></tr>
        <tr>
          <td>Email</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;min-width:0;">
              <span style="min-width:0;overflow-wrap:anywhere;word-break:break-all;">${booking.customerEmail || "—"}</span>
              <button id="bd-action-resend" type="button" style="flex-shrink:0;background:none;border:none;padding:0;color:var(--admin-info);font-size:0.78rem;font-family:inherit;cursor:pointer;white-space:nowrap;text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(96,165,250,0.4);">✉ Resend</button>
            </div>
          </td>
        </tr>
        <tr><td>Phone</td><td>${booking.customerPhone || "—"}</td></tr>
      </table>
      <div class="modal-sheet__actions" style="gap:0.6rem;">
        <button id="bd-action-delete" class="btn--close" style="flex:1;padding:0.65rem 0.5rem;text-align:center;color:var(--admin-danger);border-color:rgba(248,113,113,0.3);background:transparent;">🗑 Delete</button>
        <button id="bd-action-edit" class="btn--save" style="flex:1;padding:0.65rem 0.5rem;text-align:center;font-weight:600;background:rgba(var(--admin-accent-rgb),0.85);">✏️ Edit</button>
        ${booking.status !== "CANCELLED" ? `<button id="bd-action-cancel" class="btn--close" style="flex:1;padding:0.65rem 0.5rem;text-align:center;color:#fbbf24;border-color:rgba(251,191,36,0.35);">⊘ Cancel</button>` : ""}
        ${booking.status === "PENDING" ? `<button id="bd-action-mark-paid" class="btn--save" style="flex:1;padding:0.65rem 0.5rem;text-align:center;font-weight:600;color:#22c55e;border-color:rgba(34,197,94,0.35);background:transparent;">✓ Mark as Paid</button>` : ""}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.getElementById("bd-modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  document.getElementById("bd-action-edit").addEventListener("click", () => {
    openEditModal(booking, async (updated) => {
      const res = await fetch(`/api/admin/booking-action?id=${booking.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updated, id: booking.id })
      });
      if (res.ok) {
        Object.assign(booking, {
          customerName: updated.name || booking.customerName,
          customerEmail: updated.email || booking.customerEmail,
          customerPhone: updated.phone || booking.customerPhone,
          date: updated.date || booking.date,
          time: updated.time || booking.time,
          endTime: updated.endTime || booking.endTime,
          passengers: updated.qty ? parseInt(updated.qty) : booking.passengers,
          extras: updated.extras !== undefined ? parseInt(updated.extras) : booking.extras,
          price: updated.amount !== undefined && updated.amount !== '' ? parseFloat(updated.amount) : booking.price,
          lang: updated.lang || booking.lang,
          boat: updated.boat || booking.boat
        });
        invalidateBadgeCache();
        ensureBadges();
        onUpdated?.(booking);
        modal.remove();
      } else {
        await adminAlert("Failed to update booking.", "error");
      }
    });
  });

  document.getElementById("bd-action-resend").addEventListener("click", () => {
    openResendModal(booking);
  });

  document.getElementById("bd-action-delete").addEventListener("click", async () => {
    if (!(await adminConfirm("Permanently delete this booking? This cannot be undone.", "Delete", true))) return;
    const btn = document.getElementById("bd-action-delete");
    await withButtonLoading(btn, "Deleting…", async () => {
      try {
        const res = await fetch(`/api/admin/booking-action?id=${booking.id}`, {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: booking.id })
        });
        if (res.ok) {
          invalidateBadgeCache();
          ensureBadges();
          onDeleted?.(booking);
          modal.remove();
          return;
        }
        const body = await res.json().catch(() => ({}));
        console.error("Delete booking failed:", res.status, body);
        await adminAlert(body.error ? `Failed to delete booking: ${body.error}` : `Failed to delete booking (HTTP ${res.status}).`, "error");
      } catch (err) {
        console.error("Delete booking network error:", err);
        await adminAlert(`Network error deleting booking: ${err.message}`, "error");
      }
    });
  });

  document.getElementById("bd-action-mark-paid")?.addEventListener("click", async () => {
    if (!(await adminConfirm("Confirm the payment was verified in SumUp for this booking, then mark it as paid? This sends the confirmation email and blocks the calendar slot.", "Mark as Paid", true))) return;
    const btn = document.getElementById("bd-action-mark-paid");
    await withButtonLoading(btn, "Marking…", async () => {
      try {
        const res = await fetch(`/api/admin/mark-paid?id=${booking.id}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: booking.id })
        });
        if (res.ok) {
          booking.status = "PAID";
          invalidateBadgeCache();
          ensureBadges();
          onUpdated?.(booking);
          modal.remove();
          return;
        }
        const body = await res.json().catch(() => ({}));
        console.error("Mark-paid failed:", res.status, body);
        await adminAlert(body.error ? `Failed to mark as paid: ${body.error}` : `Failed to mark as paid (HTTP ${res.status}).`, "error");
      } catch (err) {
        console.error("Mark-paid network error:", err);
        await adminAlert(`Network error marking as paid: ${err.message}`, "error");
      }
    });
  });

  document.getElementById("bd-action-cancel")?.addEventListener("click", async () => {
    if (!(await adminConfirm("Cancel this booking?", "Cancel Booking", true))) return;
    const btn = document.getElementById("bd-action-cancel");
    await withButtonLoading(btn, "Cancelling…", async () => {
      try {
        const res = await fetch(`/api/admin/booking-action?id=${booking.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: booking.id })
        });
        if (res.ok) {
          booking.status = "CANCELLED";
          invalidateBadgeCache();
          ensureBadges();
          onCancelled?.(booking);
          modal.remove();
          return;
        }
        const body = await res.json().catch(() => ({}));
        console.error("Cancel booking failed:", res.status, body);
        await adminAlert(body.error ? `Failed to cancel booking: ${body.error}` : `Failed to cancel booking (HTTP ${res.status}).`, "error");
      } catch (err) {
        console.error("Cancel booking network error:", err);
        await adminAlert(`Network error cancelling booking: ${err.message}`, "error");
      }
    });
  });
}
