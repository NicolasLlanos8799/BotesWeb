/**
 * Shared admin modal components — used by both js/admin.js (list pages)
 * and js/admin-calendar.js (calendar detail view), so booking actions
 * (edit, resend, cancel, delete) behave identically everywhere.
 */
import { formatCurrency } from "./utils.js";

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
        <div class="modal-sheet__eyebrow">Booking</div>
        <h2 class="modal-sheet__title">Edit Details</h2>
      </div>
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
        <div class="field-grid-3">
          <label class="field-label">Date
            <input id="ed-date" value="${booking.date || ''}" class="field-input">
          </label>
          <label class="field-label">Start
            <input id="ed-time" value="${(booking.time || '').substring(0, 5)}" class="field-input">
          </label>
          <label class="field-label">End
            <input id="ed-endtime" value="${booking.endTime || ''}" placeholder="HH:MM" class="field-input">
          </label>
        </div>
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
      </div>
      <div class="modal-sheet__actions">
        <button id="ed-cancel" class="btn--close">Cancel</button>
        <button id="ed-save" class="btn--save">Save Changes</button>
      </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

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
      lang: document.getElementById("ed-lang").value
    });

    modal.remove();
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
        <tr><td>Price</td><td>${formatCurrency(booking.price)}</td></tr>
        <tr>
          <td>Email</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;">
              <span>${booking.customerEmail || "—"}</span>
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
          lang: updated.lang || booking.lang
        });
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
