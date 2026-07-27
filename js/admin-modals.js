/**
 * Shared admin modal components — used by both js/admin.js (list pages)
 * and js/admin-calendar.js (calendar detail view), so booking actions
 * (edit, resend, cancel, delete) behave identically everywhere.
 */
import { formatCurrency } from "./utils.js";

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
 * onSave(updated) -> Promise         called when "Save Changes" is clicked
 * onDelete() -> Promise (optional)   if provided, shows a Delete button with
 *                                    an inline confirm swapped into the same modal
 */
export function openEditModal(booking, onSave, onDelete) {
  const existing = document.getElementById("edit-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "edit-modal";
  modal.className = "modal-overlay";

  modal.innerHTML = `
    <div class="modal-sheet modal-sheet--wide">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
        <div>
          <div class="modal-sheet__eyebrow">Booking</div>
          <h2 class="modal-sheet__title">Edit Details</h2>
        </div>
        ${onDelete ? `<button id="ed-delete-trigger" class="btn--close" style="color:var(--admin-danger);border-color:rgba(248,113,113,0.35);">🗑 Delete</button>` : ""}
      </div>
      <div id="ed-delete-confirm" class="modal-confirm-inline" style="display:none;">
        <p>Permanently delete this booking? This cannot be undone.</p>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button id="ed-delete-cancel" class="btn--close">Cancel</button>
          <button id="ed-delete-confirm-btn" class="btn--danger">Delete</button>
        </div>
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
        <div class="field-grid-2">
          <label class="field-label">Date
            <input id="ed-date" value="${booking.date || ''}" class="field-input">
          </label>
          <label class="field-label">Time
            <input id="ed-time" value="${(booking.time || '').substring(0, 5)}" class="field-input">
          </label>
        </div>
        <div class="field-grid-3">
          <label class="field-label">Passengers
            <input id="ed-qty" value="${booking.passengers || ''}" type="number" min="1" class="field-input">
          </label>
          <label class="field-label">Charcuterie
            <input id="ed-extras" value="${booking.extras || 0}" type="number" min="0" class="field-input">
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

  const formWrap = document.getElementById("ed-form-wrap");
  const deleteConfirm = document.getElementById("ed-delete-confirm");
  const deleteTrigger = document.getElementById("ed-delete-trigger");

  if (deleteTrigger) {
    deleteTrigger.addEventListener("click", () => {
      formWrap.style.display = "none";
      deleteConfirm.style.display = "block";
    });
    document.getElementById("ed-delete-cancel").addEventListener("click", () => {
      deleteConfirm.style.display = "none";
      formWrap.style.display = "block";
    });
    document.getElementById("ed-delete-confirm-btn").addEventListener("click", async () => {
      const btn = document.getElementById("ed-delete-confirm-btn");
      btn.textContent = "Deleting...";
      btn.disabled = true;
      await onDelete();
      modal.remove();
    });
  }

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
      qty: document.getElementById("ed-qty").value.trim(),
      extras: document.getElementById("ed-extras").value.trim(),
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
    <div class="modal-sheet" style="max-width:460px;border-top-color:${sourceColor};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem;">
        <div>
          <div class="modal-sheet__eyebrow" style="color:${sourceColor};">${sourceLabel}</div>
          <h2 class="modal-sheet__title">${booking.customerName}</h2>
        </div>
        <span class="pill pill--${statusVariant}">${booking.status}</span>
      </div>
      <table class="kv-table">
        <tr><td>Tour</td><td>${booking.tourName}</td></tr>
        <tr><td>Date</td><td>${booking.date} · ${(booking.time || "").substring(0,5)}</td></tr>
        <tr><td>Passengers</td><td>${booking.passengers}${booking.extras ? ` (+${booking.extras} charcuterie)` : ""}</td></tr>
        <tr><td>Language</td><td>${booking.lang}</td></tr>
        <tr><td>Price</td><td>${formatCurrency(booking.price)}</td></tr>
        <tr><td>Email</td><td>${booking.customerEmail || "—"}</td></tr>
        <tr><td>Phone</td><td>${booking.customerPhone || "—"}</td></tr>
      </table>
      <div class="modal-sheet__actions" style="flex-wrap:wrap;">
        <button id="bd-action-edit" class="btn--close">✏️ Edit</button>
        <button id="bd-action-resend" class="btn--close" style="color:var(--admin-info);border-color:rgba(96,165,250,0.35);">✉ Resend</button>
        ${booking.status !== "CANCELLED" ? `<button id="bd-action-cancel" class="btn--close" style="color:#fbbf24;border-color:rgba(251,191,36,0.35);">⊘ Cancel</button>` : ""}
        <button id="bd-modal-close" class="btn--close" style="margin-left:auto;">Close</button>
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
          passengers: updated.qty ? parseInt(updated.qty) : booking.passengers,
          extras: updated.extras !== undefined ? parseInt(updated.extras) : booking.extras,
          lang: updated.lang || booking.lang
        });
        onUpdated?.(booking);
        modal.remove();
      } else {
        await adminAlert("Failed to update booking.", "error");
      }
    }, async () => {
      const res = await fetch(`/api/admin/booking-action?id=${booking.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.(booking);
        modal.remove();
      } else {
        await adminAlert("Failed to delete booking.", "error");
      }
    });
  });

  document.getElementById("bd-action-resend").addEventListener("click", () => {
    openResendModal(booking);
  });

  document.getElementById("bd-action-cancel")?.addEventListener("click", async () => {
    if (!(await adminConfirm("Cancel this booking?", "Cancel Booking", true))) return;
    const res = await fetch(`/api/admin/booking-action?id=${booking.id}`, { method: "PATCH" });
    if (res.ok) {
      booking.status = "CANCELLED";
      onCancelled?.(booking);
      modal.remove();
    } else {
      await adminAlert("Failed to cancel booking.", "error");
    }
  });
}
