import { formatCurrency, TOURS } from "./utils.js";

/* ── Custom Alert / Confirm ────────────────────────────────────────────────── */
function adminAlert(message, type = "info") {
  return new Promise(resolve => {
    const color = type === "success" ? "#4ade80" : type === "error" ? "#f87171" : "#e8834a";
    const icon  = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;";
    el.innerHTML = `
      <div style="background:#0d1b2e;border:1px solid var(--admin-card-border);border-top:3px solid ${color};border-radius:16px;padding:2rem;width:100%;max-width:380px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
        <div style="font-size:2rem;margin-bottom:12px;">${icon}</div>
        <p style="margin:0 0 20px;color:#fff;font-size:0.95rem;line-height:1.6;">${message}</p>
        <button id="adm-alert-ok" style="padding:0.65rem 2rem;background:${color};border:none;border-radius:8px;color:#0a0f1d;cursor:pointer;font-weight:700;font-size:0.9rem;font-family:inherit;">OK</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#adm-alert-ok").addEventListener("click", () => { el.remove(); resolve(); });
  });
}

function adminConfirm(message, confirmLabel = "Confirm", danger = false) {
  return new Promise(resolve => {
    const btnColor = danger ? "#f87171" : "#e8834a";
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;";
    el.innerHTML = `
      <div style="background:#0d1b2e;border:1px solid var(--admin-card-border);border-top:3px solid ${btnColor};border-radius:16px;padding:2rem;width:100%;max-width:380px;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
        <p style="margin:0 0 24px;color:#fff;font-size:0.95rem;line-height:1.6;">${message}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;">
          <button id="adm-confirm-no" style="padding:0.65rem 1.5rem;background:transparent;border:1px solid var(--admin-card-border);border-radius:8px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.9rem;font-family:inherit;">Cancel</button>
          <button id="adm-confirm-yes" style="padding:0.65rem 1.5rem;background:${btnColor};border:none;border-radius:8px;color:#fff;cursor:pointer;font-weight:700;font-size:0.9rem;font-family:inherit;">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector("#adm-confirm-yes").addEventListener("click", () => { el.remove(); resolve(true); });
    el.querySelector("#adm-confirm-no").addEventListener("click",  () => { el.remove(); resolve(false); });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;

  if (path.includes("/admin/bookings")) {
    initBookingsPage();
  } else if (path.includes("/admin/stats")) {
    initStatsPage();
  } else if (path.includes("/admin/manifest")) {
    initManifestPage();
  } else if (path === "/admin" || path === "/admin/" || path.includes("/admin/index.html")) {
    initDashboard();
  }
});

/**
 * Common: Fetch all bookings from MySQL API
 */
async function fetchAllBookings() {
  try {
    const res = await fetch("/api/admin/get-bookings");
    if (!res.ok) throw new Error("Failed to fetch bookings");
    const data = await res.json();

    return data.bookings.map(b => {
      // Improved date parsing: split string if it comes as ISO or use as is if it's a date string
      let datePart = '2026-01-01';
      if (b.booking_date) {
        const d = new Date(b.booking_date);
        // Get local YYYY-MM-DD
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        datePart = `${year}-${month}-${day}`;
      }

      const timePart = b.booking_time || '00:00:00';

      return {
        id: b.id,
        start: `${datePart}T${timePart}`,
        date: datePart,
        time: timePart,
        tourName: b.tour_name,
        customerName: b.customer_name,
        customerEmail: b.customer_email,
        customerPhone: b.customer_phone,
        passengers: parseInt(b.passengers) || 0,
        status: b.payment_status,
        price: parseFloat(b.total_price) || 0,
        calendar: b.tour_id || 'N/A',
        lang: b.lang || 'english',
        extras: parseInt(b.extras) || 0
      };
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    return [];
  }
}

/**
 * BOOKINGS LIST PAGE
 */
async function initBookingsPage() {
  const tbody = document.getElementById("bookings-tbody");
  const paginationContainer = document.getElementById("bookings-pagination");
  const searchInput = document.getElementById("booking-search");
  const filterStatus = document.getElementById("booking-filter-status");
  const filterDateFrom = document.getElementById("filter-date-from");
  const filterDateTo = document.getElementById("filter-date-to");
  const refreshBtn = document.getElementById("refresh-bookings");

  let allBookings = [];
  let filteredBookings = [];
  let currentPage = 1;
  const pageSize = 5;

  const renderPagination = (totalItems) => {
    if (!paginationContainer) return;
    const totalPages = Math.ceil(totalItems / pageSize);

    if (totalPages <= 1) {
      paginationContainer.innerHTML = "";
      return;
    }

    paginationContainer.innerHTML = `
      <button class="btn btn--outline btn--sm" ${currentPage === 1 ? 'disabled' : ''} id="prev-page">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
        Prev
      </button>
      <span style="font-size: 0.9rem; font-weight: 600; opacity: 0.8;">Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn--outline btn--sm" ${currentPage === totalPages ? 'disabled' : ''} id="next-page">
        Next
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;

    document.getElementById("prev-page")?.addEventListener("click", () => {
      currentPage--;
      render(filteredBookings);
    });
    document.getElementById("next-page")?.addEventListener("click", () => {
      currentPage++;
      render(filteredBookings);
    });
  };

  const render = (data) => {
    if (!tbody) return;

    // Paging logic
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pagedData = data.slice(start, end);

    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.4);">No bookings found for this period.</td></tr>`;
      renderPagination(0);
      return;
    }

    const isMobile = window.innerWidth < 768;
    const tableWrap = document.querySelector(".admin-table-wrap");
    const cardsEl = document.getElementById("bookings-cards");

    if (isMobile) {
      tableWrap.style.display = "none";
      cardsEl.style.display = "block";
      cardsEl.innerHTML = pagedData.map(b => {
        const date = new Date(b.start);
        const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return `<div class="booking-card" style="background:#0d1b2e;border:1px solid var(--admin-card-border);border-radius:12px;padding:1rem 1.1rem;margin-bottom:0.85rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.6rem;">
            <div>
              <div style="font-weight:700;color:#fff;font-size:1rem;">${b.customerName}</div>
              <div style="font-size:0.78rem;opacity:0.5;">${b.customerEmail}</div>
            </div>
            <span class="badge-status status-${b.status.toLowerCase()}">${b.status}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1rem;font-size:0.82rem;margin-bottom:0.85rem;color:rgba(255,255,255,0.85);">
            <div><div style="opacity:0.45;font-size:0.73rem;margin-bottom:2px;">Date &amp; Time</div><strong>${dateStr} · ${timeStr}</strong></div>
            <div><div style="opacity:0.45;font-size:0.73rem;margin-bottom:2px;">Tour</div><strong>${b.tourName}</strong></div>
            <div><div style="opacity:0.45;font-size:0.73rem;margin-bottom:2px;">Passengers</div><strong>${b.passengers} pax</strong></div>
            <div><div style="opacity:0.45;font-size:0.73rem;margin-bottom:2px;">Extras 🍷</div><strong style="color:${b.extras > 0 ? '#e8834a' : 'inherit'}">${b.extras > 0 ? b.extras : '—'}</strong></div>
            ${b.customerPhone ? `<div style="grid-column:1/-1"><div style="opacity:0.45;font-size:0.73rem;margin-bottom:2px;">Phone</div><strong>${b.customerPhone}</strong></div>` : ''}
          </div>
          <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
            <button class="action-edit" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' style="flex:1;min-width:70px;padding:8px 6px;border-radius:8px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.85);font-size:0.78rem;cursor:pointer;font-family:inherit;">✏️ Edit</button>
            <button class="action-resend" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' style="flex:1;min-width:70px;padding:8px 6px;border-radius:8px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;font-size:0.78rem;cursor:pointer;font-family:inherit;">✉ Resend</button>
            ${b.status !== 'CANCELLED' ? `<button class="action-cancel" data-id="${b.id}" style="flex:1;min-width:70px;padding:8px 6px;border-radius:8px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;font-size:0.78rem;cursor:pointer;font-family:inherit;">⊘ Cancel</button>` : ''}
            <button class="action-delete" data-id="${b.id}" style="flex:1;min-width:70px;padding:8px 6px;border-radius:8px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.3);color:#f87171;font-size:0.78rem;cursor:pointer;font-family:inherit;">🗑 Delete</button>
          </div>
        </div>`;
      }).join("");
    } else {
      tableWrap.style.display = "";
      if (cardsEl) cardsEl.style.display = "none";
      tbody.innerHTML = pagedData.map(b => {
        const date = new Date(b.start);
        const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: #fff;">${dateStr}</div>
              <div style="font-size: 0.8rem; opacity: 0.6;">${timeStr}</div>
            </td>
            <td>
              <div style="font-weight: 600;">${b.customerName}</div>
              <div style="font-size: 0.8rem; opacity: 0.5;">${b.customerEmail}</div>
            </td>
            <td style="font-size: 0.85rem;">${b.customerPhone || '—'}</td>
            <td>${b.tourName}</td>
            <td>${b.passengers} pax</td>
            <td>${b.extras > 0 ? `<span style="color:#e8834a;font-weight:600;">${b.extras}</span>` : '<span style="opacity:0.3;">—</span>'}</td>
            <td><span style="text-transform: capitalize;">${b.calendar}</span></td>
            <td>
              <span class="badge-status status-${b.status.toLowerCase()}">${b.status}</span>
            </td>
            <td>
              <button class="action-menu-btn" data-id="${b.id}" data-booking='${JSON.stringify(b).replace(/'/g, "&#39;")}' data-cancelled="${b.status === 'CANCELLED'}" style="font-size:1rem;padding:4px 12px;letter-spacing:2px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;cursor:pointer;">⋯</button>
            </td>
          </tr>
        `;
      }).join("");
    }

    renderPagination(data.length);

    const renderTarget = isMobile ? cardsEl : tbody;

    // Dropdown toggle — uses a single fixed panel appended to body to escape overflow clipping
    let globalDropdown = document.getElementById("global-action-dropdown");
    if (!globalDropdown) {
      globalDropdown = document.createElement("div");
      globalDropdown.id = "global-action-dropdown";
      globalDropdown.style.cssText = "display:none;position:fixed;background:#0d1b2e;border:1px solid rgba(255,255,255,0.12);border-radius:10px;z-index:9999;min-width:170px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.6);";
      document.body.appendChild(globalDropdown);
      document.addEventListener("click", () => { globalDropdown.style.display = "none"; });
    }

    renderTarget.querySelectorAll(".action-menu-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const bookingData = btn.dataset.booking;
        const isCancelled = btn.dataset.cancelled === "true";
        const id = btn.dataset.id;
        const itemStyle = "display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 16px;background:none;border:none;border-bottom:1px solid rgba(255,255,255,0.08);font-size:0.85rem;cursor:pointer;font-family:inherit;";
        globalDropdown.innerHTML = `
          <button class="action-edit dropdown-item" data-booking='${bookingData}' style="${itemStyle}color:rgba(255,255,255,0.85);">✏️ <span>Edit</span></button>
          <button class="action-resend dropdown-item" data-booking='${bookingData}' style="${itemStyle}color:#60a5fa;">✉ <span>Resend Email</span></button>
          ${!isCancelled ? `<button class="action-cancel dropdown-item" data-id="${id}" style="${itemStyle}color:#fbbf24;">⊘ <span>Cancel</span></button>` : ''}
          <button class="action-delete dropdown-item" data-id="${id}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:11px 16px;background:none;border:none;font-size:0.85rem;cursor:pointer;font-family:inherit;color:#f87171;">🗑 <span>Delete</span></button>
        `;

        // Position below the button, aligned to its right edge
        const rect = btn.getBoundingClientRect();
        globalDropdown.style.display = "block";
        const ddW = globalDropdown.offsetWidth;
        let left = rect.right - ddW;
        if (left < 8) left = 8;
        globalDropdown.style.top = (rect.bottom + 6) + "px";
        globalDropdown.style.left = left + "px";

        // Wire up actions — mirror the same logic as the mobile card buttons
        const editBtn = globalDropdown.querySelector(".action-edit");
        if (editBtn) editBtn.addEventListener("click", () => {
          globalDropdown.style.display = "none";
          const b = JSON.parse(editBtn.dataset.booking);
          openEditModal(b, async (updated) => {
            const res = await fetch(`/api/admin/booking-action?id=${b.id}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...updated, id: b.id })
            });
            if (res.ok) {
              Object.assign(b, {
                customerName: updated.name || b.customerName,
                customerEmail: updated.email || b.customerEmail,
                customerPhone: updated.phone || b.customerPhone,
                date: updated.date || b.date,
                time: updated.time || b.time,
                passengers: updated.qty ? parseInt(updated.qty) : b.passengers,
                extras: updated.extras !== undefined ? parseInt(updated.extras) : b.extras,
                lang: updated.lang || b.lang
              });
              const idx = allBookings.findIndex(x => String(x.id) === String(b.id));
              if (idx !== -1) allBookings[idx] = b;
              const fidx = filteredBookings.findIndex(x => String(x.id) === String(b.id));
              if (fidx !== -1) filteredBookings[fidx] = b;
              render(filteredBookings);
            } else { await adminAlert("Failed to update booking.", "error"); }
          });
        });
        const resendBtn = globalDropdown.querySelector(".action-resend");
        if (resendBtn) resendBtn.addEventListener("click", () => {
          globalDropdown.style.display = "none";
          openResendModal(JSON.parse(resendBtn.dataset.booking));
        });
        const cancelBtn = globalDropdown.querySelector(".action-cancel");
        if (cancelBtn) cancelBtn.addEventListener("click", async () => {
          globalDropdown.style.display = "none";
          if (!(await adminConfirm("Cancel this booking?", "Cancel Booking", true))) return;
          const cid = cancelBtn.dataset.id;
          const res = await fetch(`/api/admin/booking-action?id=${cid}`, { method: "PATCH" });
          if (res.ok) {
            const bk = allBookings.find(x => String(x.id) === String(cid));
            if (bk) bk.status = "CANCELLED";
            const fk = filteredBookings.find(x => String(x.id) === String(cid));
            if (fk) fk.status = "CANCELLED";
            render(filteredBookings);
          } else { await adminAlert("Failed to cancel booking.", "error"); }
        });
        const deleteBtn = globalDropdown.querySelector(".action-delete");
        if (deleteBtn) deleteBtn.addEventListener("click", async () => {
          globalDropdown.style.display = "none";
          if (!(await adminConfirm("Permanently delete this booking? This cannot be undone.", "Delete", true))) return;
          const did = deleteBtn.dataset.id;
          const res = await fetch(`/api/admin/booking-action?id=${did}`, { method: "DELETE" });
          if (res.ok) {
            allBookings = allBookings.filter(x => String(x.id) !== String(did));
            filteredBookings = filteredBookings.filter(x => String(x.id) !== String(did));
            render(filteredBookings);
          } else { await adminAlert("Failed to delete booking.", "error"); }
        });
      });
    });

    renderTarget.querySelectorAll(".action-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!(await adminConfirm("Permanently delete this booking? This cannot be undone.", "Delete", true))) return;
        const id = btn.dataset.id;
        const res = await fetch(`/api/admin/booking-action?id=${id}`, { method: "DELETE" });
        if (res.ok) {
          allBookings = allBookings.filter(b => String(b.id) !== String(id));
          filteredBookings = filteredBookings.filter(b => String(b.id) !== String(id));
          render(filteredBookings);
        } else {
          await adminAlert("Failed to delete booking.", "error");
        }
      });
    });

    renderTarget.querySelectorAll(".action-cancel").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!(await adminConfirm("Cancel this booking?", "Cancel Booking", true))) return;
        const id = btn.dataset.id;
        const res = await fetch(`/api/admin/booking-action?id=${id}`, { method: "PATCH" });
        if (res.ok) {
          const booking = allBookings.find(b => String(b.id) === String(id));
          if (booking) booking.status = "CANCELLED";
          const fb = filteredBookings.find(b => String(b.id) === String(id));
          if (fb) fb.status = "CANCELLED";
          render(filteredBookings);
        } else {
          await adminAlert("Failed to cancel booking.", "error");
        }
      });
    });

    renderTarget.querySelectorAll(".action-resend").forEach(btn => {
      btn.addEventListener("click", () => {
        const b = JSON.parse(btn.dataset.booking);
        openResendModal(b);
      });
    });

    renderTarget.querySelectorAll(".action-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const b = JSON.parse(btn.dataset.booking);
        openEditModal(b, async (updated) => {
          const res = await fetch(`/api/admin/booking-action?id=${b.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...updated, id: b.id })
          });
          if (res.ok) {
            Object.assign(b, {
              customerName: updated.name || b.customerName,
              customerEmail: updated.email || b.customerEmail,
              customerPhone: updated.phone || b.customerPhone,
              date: updated.date || b.date,
              time: updated.time || b.time,
              passengers: updated.qty ? parseInt(updated.qty) : b.passengers,
              extras: updated.extras !== undefined ? parseInt(updated.extras) : b.extras,
              lang: updated.lang || b.lang
            });
            const idx = allBookings.findIndex(x => String(x.id) === String(b.id));
            if (idx !== -1) allBookings[idx] = b;
            const fidx = filteredBookings.findIndex(x => String(x.id) === String(b.id));
            if (fidx !== -1) filteredBookings[fidx] = b;
            render(filteredBookings);
          } else {
            await adminAlert("Failed to update booking.", "error");
          }
        });
      });
    });
  };

  const handleFilters = () => {
    const query = searchInput.value.toLowerCase();
    const status = filterStatus.value.toLowerCase();
    const from = filterDateFrom?.value;
    const to = filterDateTo?.value;

    filteredBookings = allBookings.filter(b => {
      const matchesSearch =
        b.customerName.toLowerCase().includes(query) ||
        b.customerEmail.toLowerCase().includes(query) ||
        b.tourName.toLowerCase().includes(query);

      const matchesStatus = status === "all" || b.status.toLowerCase() === status;
      const matchesDate = (!from || b.date >= from) && (!to || b.date <= to);

      return matchesSearch && matchesStatus && matchesDate;
    });

    currentPage = 1; // Reset to page 1 on filter
    render(filteredBookings);
  };

  const loadData = async () => {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 4rem;"><div class="po-spinner" style="margin: 0 auto 1rem;"></div>Loading bookings...</td></tr>`;
    allBookings = await fetchAllBookings();
    allBookings.sort((a, b) => new Date(b.start) - new Date(a.start));
    filteredBookings = [...allBookings];
    render(filteredBookings);
  };

  searchInput?.addEventListener("input", handleFilters);
  filterStatus?.addEventListener("change", handleFilters);
  filterDateFrom?.addEventListener("change", handleFilters);
  filterDateTo?.addEventListener("change", handleFilters);
  refreshBtn?.addEventListener("click", loadData);

  loadData();
}

/**
 * DASHBOARD HOME PAGE
 */
async function initDashboard() {
  const elements = {
    revenueMonth: document.getElementById("stat-revenue-month"),
    growth: document.getElementById("stat-growth-container"),
    pax: document.getElementById("stat-passengers"),
    upcoming: document.getElementById("upcoming-tbody")
  };

  const bookings = await fetchAllBookings();
  const paid = bookings.filter(b => b.status === "PAID");

  // 1. Monthly Revenue & Growth
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthBookings = paid.filter(b => {
    const d = new Date(b.start);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const lastMonthBookings = paid.filter(b => {
    const d = new Date(b.start);
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    return d.getMonth() === lastMonth && d.getFullYear() === lastYear;
  });

  const thisMonthRev = thisMonthBookings.reduce((sum, b) => sum + b.price, 0);
  const lastMonthRev = lastMonthBookings.reduce((sum, b) => sum + b.price, 0);

  if (elements.revenueMonth) elements.revenueMonth.textContent = formatCurrency(thisMonthRev);

  if (elements.growth) {
    let growth = 0;
    if (lastMonthRev > 0) {
      growth = ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100;
    } else if (thisMonthRev > 0) {
      growth = 100;
    }

    const isUp = growth >= 0;
    elements.growth.className = `stat-card__trend ${isUp ? 'trend-up' : 'trend-down'}`;
    elements.growth.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${isUp ? '23 6 13.5 15.5 8.5 10.5 1 18' : '23 18 13.5 8.5 8.5 13.5 1 6'}"></polyline><polyline points="${isUp ? '17 6 23 6 23 12' : '17 18 23 18 23 12'}"></polyline></svg>
      <span>${Math.abs(Math.round(growth))}% vs last month</span>
    `;
  }

  // 2. Total Passengers
  const totalPax = paid.reduce((sum, b) => sum + b.passengers, 0);
  if (elements.pax) elements.pax.textContent = totalPax;

  // 3. Upcoming Bookings (Next 5)
  if (elements.upcoming) {
    const upcoming = bookings
      .filter(b => new Date(b.start) >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5);

    if (upcoming.length === 0) {
      elements.upcoming.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; opacity: 0.5;">No upcoming bookings found.</td></tr>`;
    } else {
      elements.upcoming.innerHTML = upcoming.map(b => {
        const d = new Date(b.start);
        return `
          <tr>
            <td>${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} @ ${b.time.substring(0, 5)}</td>
            <td>${b.customerName}</td>
            <td>${b.tourName}</td>
            <td>${b.calendar}</td>
          </tr>
        `;
      }).join("");
    }
  }
}

/**
 * STATS PAGE (Charts)
 */
let charts = {}; // To store chart instances for destruction

async function initStatsPage() {
  const btn = document.getElementById("apply-filters");
  const fromInput = document.getElementById("filter-date-from");
  const toInput = document.getElementById("filter-date-to");

  let allBookings = await fetchAllBookings();

  const updateStats = () => {
    const from = fromInput?.value;
    const to = toInput?.value;

    const filtered = allBookings.filter(b => {
      const matchesDate = (!from || b.date >= from) && (!to || b.date <= to);
      return matchesDate;
    });

    const paid = filtered.filter(b => b.status === "PAID");

    // Basic Stats
    const totalRev = paid.reduce((sum, b) => sum + b.price, 0);
    const totalPax = paid.reduce((sum, b) => sum + b.passengers, 0);
    const avgVal = paid.length > 0 ? totalRev / paid.length : 0;

    document.getElementById("stat-revenue").textContent = formatCurrency(totalRev);
    document.getElementById("stat-bookings").textContent = paid.length;
    document.getElementById("stat-avg").textContent = formatCurrency(avgVal);
    document.getElementById("stat-passengers").textContent = totalPax;

    // 1. Hourly Heatmap
    const hourCounts = Array(24).fill(0);
    paid.forEach(b => {
      const hour = parseInt(b.time.split(':')[0]);
      hourCounts[hour]++;
    });
    renderBarChart('chart-hours', Array.from({ length: 24 }, (_, i) => `${i}:00`), hourCounts, 'Bookings by Hour');

    // 2. Weekday Performance
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayRev = Array(7).fill(0);
    paid.forEach(b => {
      const day = new Date(b.start).getDay();
      dayRev[day] += b.price;
    });
    renderBarChart('chart-weekdays', dayNames, dayRev, 'Revenue by Day (€)', '#4ade80');

    // 4. Language Distribution
    const langCounts = {};
    paid.forEach(b => {
      langCounts[b.lang] = (langCounts[b.lang] || 0) + 1;
    });
    renderPieChart('chart-languages', Object.keys(langCounts), Object.values(langCounts));

    // Legacy Tour Distribution
    const tourCounts = {};
    paid.forEach(b => {
      tourCounts[b.tourName] = (tourCounts[b.tourName] || 0) + 1;
    });
    const distEl = document.getElementById("tour-distribution");
    if (distEl) {
      const sorted = Object.entries(tourCounts).sort((a, b) => b[1] - a[1]);
      distEl.innerHTML = sorted.map(([name, count]) => {
        const pct = paid.length > 0 ? Math.round((count / paid.length) * 100) : 0;
        return `<div style="margin-bottom: 0.5rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.2rem;">
            <span>${name}</span><span>${count} (${pct}%)</span>
          </div>
          <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; background: var(--admin-accent); width: ${pct}%;"></div>
          </div>
        </div>`;
      }).join("");
    }
  };

  btn?.addEventListener("click", updateStats);
  updateStats();
}

/**
 * CAPTAIN'S MANIFEST
 */
async function initManifestPage() {
  const container = document.getElementById("manifest-container");
  const dateHeader = document.getElementById("manifest-date");

  const now = new Date();
  // Get local YYYY-MM-DD instead of UTC
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (dateHeader) dateHeader.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const bookings = await fetchAllBookings();
  const todayBookings = bookings
    .filter(b => b.date === todayStr)
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!container) return;

  if (todayBookings.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 4rem; opacity: 0.5;">No bookings scheduled for today. Enjoy the calm! ⚓</div>`;
  } else {
    container.innerHTML = todayBookings.map(b => `
      <div class="manifest-item">
        <div class="manifest-item__info">
          <div class="manifest-item__time">${b.time.substring(0, 5)}</div>
          <div class="manifest-item__name">${b.customerName}</div>
          <div class="manifest-item__meta">${b.tourName} • ${b.lang.toUpperCase()}</div>
        </div>
        <div class="manifest-item__pax">
          <span class="manifest-item__pax-num">${b.passengers}</span>
          <span class="manifest-item__pax-label">Pax</span>
        </div>
      </div>
    `).join("");
  }
}

/**
 * Chart Helpers
 */
function renderBarChart(id, labels, data, label, color = '#e8834a') {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  if (charts[id]) charts[id].destroy();

  charts[id] = new Chart(ctx, {
    // ...
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: color,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)' } },
        x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)' } }
      }
    }
  });
}

const MODAL_INPUT_STYLE = "display:block;width:100%;margin-top:6px;padding:0.75rem 1.25rem;background:var(--admin-card-bg);border:1px solid var(--admin-card-border);border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;font-family:inherit;transition:border-color 0.2s;";
const MODAL_LABEL_STYLE = "font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);";

/**
 * EDIT BOOKING MODAL
 */
function openEditModal(booking, onSave) {
  const existing = document.getElementById("edit-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "edit-modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;";

  modal.innerHTML = `
    <div style="background:#0d1b2e;border:1px solid var(--admin-card-border);border-top:3px solid var(--admin-accent);border-radius:16px;padding:2rem;width:100%;max-width:500px;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
      <div style="margin-bottom:1.5rem;">
        <div style="font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--admin-accent);font-weight:700;margin-bottom:6px;">Booking</div>
        <h2 style="margin:0;font-size:1.4rem;color:#fff;font-weight:700;">Edit Details</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <label style="${MODAL_LABEL_STYLE}">Name
          <input id="ed-name" value="${booking.customerName || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <label style="${MODAL_LABEL_STYLE}">Email
          <input id="ed-email" value="${booking.customerEmail || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <label style="${MODAL_LABEL_STYLE}">Phone
          <input id="ed-phone" value="${booking.customerPhone || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <label style="${MODAL_LABEL_STYLE}">Date
            <input id="ed-date" value="${booking.date || ''}" style="${MODAL_INPUT_STYLE}">
          </label>
          <label style="${MODAL_LABEL_STYLE}">Time
            <input id="ed-time" value="${(booking.time || '').substring(0, 5)}" style="${MODAL_INPUT_STYLE}">
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
          <label style="${MODAL_LABEL_STYLE}">Passengers
            <input id="ed-qty" value="${booking.passengers || ''}" type="number" min="1" style="${MODAL_INPUT_STYLE}">
          </label>
          <label style="${MODAL_LABEL_STYLE}">Charcuterie
            <input id="ed-extras" value="${booking.extras || 0}" type="number" min="0" style="${MODAL_INPUT_STYLE}">
          </label>
          <label style="${MODAL_LABEL_STYLE}">Language
            <select id="ed-lang" style="${MODAL_INPUT_STYLE}">
              <option value="english" ${(booking.lang || 'english') === 'english' ? 'selected' : ''}>English</option>
              <option value="spanish" ${booking.lang === 'spanish' ? 'selected' : ''}>Spanish</option>
              <option value="danish" ${booking.lang === 'danish' ? 'selected' : ''}>Danish</option>
            </select>
          </label>
        </div>
      </div>
      <div style="display:flex;gap:0.75rem;margin-top:1.75rem;justify-content:flex-end;">
        <button id="ed-cancel" style="padding:0.65rem 1.25rem;background:transparent;border:1px solid var(--admin-card-border);border-radius:8px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.9rem;font-family:inherit;">Cancel</button>
        <button id="ed-save" style="padding:0.65rem 1.5rem;background:var(--admin-accent);border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:700;font-family:inherit;">Save Changes</button>
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
function openResendModal(booking) {
  const existing = document.getElementById("resend-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "resend-modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;";

  modal.innerHTML = `
    <div style="background:#0d1b2e;border:1px solid var(--admin-card-border);border-top:3px solid #60a5fa;border-radius:16px;padding:2rem;width:100%;max-width:500px;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
      <div style="margin-bottom:1.5rem;">
        <div style="font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase;color:#60a5fa;font-weight:700;margin-bottom:6px;">Email</div>
        <h2 style="margin:0;font-size:1.4rem;color:#fff;font-weight:700;">Resend Confirmation</h2>
      </div>
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <label style="${MODAL_LABEL_STYLE}">Name
          <input id="re-name" value="${booking.customerName || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <label style="${MODAL_LABEL_STYLE}">Email
          <input id="re-email" value="${booking.customerEmail || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <label style="${MODAL_LABEL_STYLE}">Phone
          <input id="re-phone" value="${booking.customerPhone || ''}" style="${MODAL_INPUT_STYLE}">
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <label style="${MODAL_LABEL_STYLE}">Date
            <input id="re-date" value="${booking.date || ''}" style="${MODAL_INPUT_STYLE}">
          </label>
          <label style="${MODAL_LABEL_STYLE}">Time
            <input id="re-time" value="${(booking.time || '').substring(0, 5)}" style="${MODAL_INPUT_STYLE}">
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <label style="${MODAL_LABEL_STYLE}">Charcuterie Extras
            <input id="re-extras" value="${booking.extras || 0}" type="number" min="0" style="${MODAL_INPUT_STYLE}">
          </label>
          <label style="${MODAL_LABEL_STYLE}">Language
            <select id="re-lang" style="${MODAL_INPUT_STYLE}">
              <option value="english" ${(booking.lang || 'english') === 'english' ? 'selected' : ''}>English</option>
              <option value="spanish" ${booking.lang === 'spanish' ? 'selected' : ''}>Spanish</option>
              <option value="danish" ${booking.lang === 'danish' ? 'selected' : ''}>Danish</option>
            </select>
          </label>
        </div>
      </div>
      <div id="re-error" style="margin-top:0.75rem;color:#f87171;font-size:0.8rem;display:none;"></div>
      <div style="display:flex;gap:0.75rem;margin-top:1.75rem;justify-content:flex-end;">
        <button id="re-cancel" style="padding:0.65rem 1.25rem;background:transparent;border:1px solid var(--admin-card-border);border-radius:8px;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.9rem;font-family:inherit;">Cancel</button>
        <button id="re-send" style="padding:0.65rem 1.5rem;background:#60a5fa;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:700;font-family:inherit;">✉ Send Email</button>
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

function renderPieChart(id, labels, data) {
  const ctx = document.getElementById(id);
  if (!ctx) return;

  if (charts[id]) charts[id].destroy();

  charts[id] = new Chart(ctx, {
    // ...
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#e8834a', '#4ade80', '#60a5fa', '#f472b6', '#fbbf24'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } } } }
    }
  });
}

