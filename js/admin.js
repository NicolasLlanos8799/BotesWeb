import { formatCurrency, TOURS } from "./utils.js";
import { adminAlert, adminConfirm, openEditModal, openResendModal, openBookingDetailModal, openCreateBookingModal } from "./admin-modals.js";
import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/admin/refresh", { method: "POST" }).catch(() => {});

  const path = window.location.pathname;

  if (path.includes("/admin/notifications")) {
    initNotificationsPage();
  } else {
    // Any other admin page: still populate the sidebar notification badges.
    fetchAllBookings().then(updateNavBadges);
  }

  if (path.includes("/admin/gyg-bookings")) {
    initBookingsPage({
      tbodyId: "gyg-bookings-tbody",
      paginationId: "gyg-bookings-pagination",
      searchId: "gyg-booking-search",
      tabsId: "gyg-status-tabs",
      dateFromId: "gyg-filter-date-from",
      dateToId: "gyg-filter-date-to",
      dateToggleId: "gyg-date-filter-toggle",
      dateRangeId: "gyg-date-filter-range",
      refreshId: "refresh-gyg-bookings",
      cardsId: "gyg-bookings-cards",
      emptyMessage: "No GetYourGuide bookings found for this period.",
      filterFn: b => b.isGyg,
      source: "gyg"
    });
  } else if (path.includes("/admin/bookings")) {
    initBookingsPage({
      tbodyId: "bookings-tbody",
      paginationId: "bookings-pagination",
      searchId: "booking-search",
      tabsId: "booking-status-tabs",
      dateFromId: "filter-date-from",
      dateToId: "filter-date-to",
      dateToggleId: "date-filter-toggle",
      dateRangeId: "date-filter-range",
      refreshId: "refresh-bookings",
      cardsId: "bookings-cards",
      emptyMessage: "No bookings found for this period.",
      filterFn: b => !b.isGyg,
      source: "web"
    });
  } else if (path.includes("/admin/stats")) {
    initStatsPage();
  } else if (path.includes("/admin/manifest")) {
    initManifestPage();
  }
});

/**
 * Common: Fetch bookings from the API.
 * opts: { limit, offset, source: 'gyg' | 'web' } — all optional. Omitting
 * them fetches the full history (used by Dashboard/Stats/Manifest, which
 * need the complete dataset to compute totals).
 */
async function fetchBookings(opts = {}) {
  try {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", opts.limit);
    if (opts.offset) params.set("offset", opts.offset);
    if (opts.source) params.set("source", opts.source);
    const qs = params.toString();
    const res = await fetch(`/api/admin/get-bookings${qs ? `?${qs}` : ""}`);
    if (!res.ok) throw new Error("Failed to fetch bookings");
    const data = await res.json();

    return data.bookings.filter(b => {
      // Drop GYG holds that never got confirmed (abandoned /reserve/, later
      // auto-cancelled by GYG via /cancel-reservation/). No real customer,
      // no charge — just noise, not a booking.
      const neverConfirmed = b.payment_status === 'CANCELLED' && !b.customer_email && !(parseFloat(b.total_price) > 0);
      return !neverConfirmed;
    }).map(b => {
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
      const email = b.customer_email || '';

      // End time: use the stored override if present, otherwise derive it
      // from the tour's standard duration.
      let endTime = b.booking_end_time ? b.booking_end_time.substring(0, 5) : null;
      if (!endTime) {
        const durHours = parseInt(TOURS[b.tour_id]?.duration) || 0;
        const startStr = timePart.substring(0, 5);
        if (startStr && durHours) {
          const [h, m] = startStr.split(':').map(Number);
          const total = h * 60 + m + durHours * 60;
          endTime = `${String(Math.floor((total / 60) % 24)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
        }
      }

      return {
        id: b.id,
        start: `${datePart}T${timePart}`,
        date: datePart,
        time: timePart,
        endTime,
        // Las reservas GYG se guardan como "GYG Option 1288168" — mostramos el nombre real del tour
        tourName: (!b.tour_name || /^GYG (Option|Direct Book)/i.test(b.tour_name))
          ? (TOURS[b.tour_id]?.title || b.tour_name || 'Unknown Tour')
          : b.tour_name,
        customerName: b.customer_name || 'Unknown Customer',
        customerEmail: email,
        customerPhone: b.customer_phone,
        passengers: parseInt(b.passengers) || 0,
        status: b.payment_status || 'PENDING',
        price: parseFloat(b.total_price) || 0,
        calendar: b.tour_id || 'N/A',
        boat: b.boat || null,
        lang: b.lang || 'english',
        extras: parseInt(b.extras) || 0,
        createdAt: b.created_at ? new Date(b.created_at) : null,
        isGyg: b.source === 'gyg' || email.toLowerCase().endsWith('@reply.getyourguide.com'),
        gygReference: b.gyg_booking_id || null
      };
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    return [];
  }
}

// Full-history fetch — Dashboard/Stats/Manifest need the complete dataset.
async function fetchAllBookings() {
  return fetchBookings();
}

/**
 * BOOKINGS LIST PAGE
 */
async function initBookingsPage(config) {
  const {
    tbodyId, paginationId, searchId, tabsId, dateFromId, dateToId, dateToggleId, dateRangeId, refreshId, cardsId,
    emptyMessage = "No bookings found for this period.",
    filterFn = () => true,
    source
  } = config;

  const tbody = document.getElementById(tbodyId);
  const paginationContainer = document.getElementById(paginationId);
  const searchInput = document.getElementById(searchId);
  const tabsContainer = document.getElementById(tabsId);
  const filterDateFrom = document.getElementById(dateFromId);
  const filterDateTo = document.getElementById(dateToId);
  const dateToggleBtn = document.getElementById(dateToggleId);
  const dateRangeEl = document.getElementById(dateRangeId);
  const refreshBtn = document.getElementById(refreshId);
  const cardsElId = cardsId;

  dateToggleBtn?.addEventListener("click", () => {
    const isOpen = dateRangeEl.classList.toggle("open");
    dateToggleBtn.classList.toggle("active", isOpen);
  });

  let allBookings = [];
  let filteredBookings = [];
  let currentPage = 1;
  let currentTab = "all";
  const pageSize = 10;

  const renderPagination = (totalItems) => {
    if (!paginationContainer) return;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const hasNext = currentPage < totalPages;

    if (totalPages <= 1 && !hasNext) {
      paginationContainer.innerHTML = "";
      return;
    }

    paginationContainer.innerHTML = `
      <button class="btn btn--outline btn--sm" ${currentPage === 1 ? 'disabled' : ''} id="prev-page">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
        Prev
      </button>
      <span style="font-size: 0.9rem; font-weight: 600; opacity: 0.8;">Page ${currentPage} of ${totalPages}</span>
      <button class="btn btn--outline btn--sm" ${hasNext ? '' : 'disabled'} id="next-page">
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

  const statusVariant = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'PAID' || s === 'CONFIRMED') return 'confirmed';
    if (s === 'CANCELLED') return 'cancelled';
    return 'pending';
  };

  const endTimeFor = (b) => b.endTime || null;

  const bookingRowHtml = (b) => {
    const dateObj = new Date(`${b.date}T00:00:00`);
    const dateStr = dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const startStr = (b.time || '').substring(0, 5);
    const endStr = endTimeFor(b);
    const variant = statusVariant(b.status);
    return `
      <tr class="admin-table-row" data-booking-id="${b.id}" style="cursor:pointer;">
        <td>${dateStr}</td>
        <td>${b.customerName}</td>
        <td>${b.tourName}</td>
        ${source === 'gyg' ? `<td>${b.gygReference || '—'}</td>` : ''}
        <td>${startStr}${endStr ? ` – ${endStr}` : ''}</td>
        <td style="white-space:nowrap;">${formatCurrency(b.price)} <span class="pill pill--${variant}" style="margin-left:6px;">${b.status}</span></td>
      </tr>`;
  };

  const render = (data) => {
    const listEl = document.getElementById(cardsElId);
    if (!listEl) return;

    // Paging logic
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pagedData = data.slice(start, end);

    if (data.length === 0) {
      listEl.innerHTML = `<div class="data-card__empty">${emptyMessage}</div>`;
      renderPagination(0);
      return;
    }

    listEl.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Experience</th>
              ${source === 'gyg' ? '<th>Reference</th>' : ''}
              <th>Start – End</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pagedData.map(bookingRowHtml).join("")}
          </tbody>
        </table>
      </div>
    `;

    renderPagination(data.length);

    // Whole row is clickable — opens the booking detail modal with
    // Edit / Resend / Cancel / Delete baked in.
    listEl.querySelectorAll(".admin-table-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.bookingId;
        const b = allBookings.find(x => String(x.id) === String(id));
        if (!b) return;
        const syncLocal = (updated) => {
          const idx = allBookings.findIndex(x => String(x.id) === String(updated.id));
          if (idx !== -1) allBookings[idx] = updated;
          const fidx = filteredBookings.findIndex(x => String(x.id) === String(updated.id));
          if (fidx !== -1) filteredBookings[fidx] = updated;
          updateTabCounts();
          render(filteredBookings);
        };
        openBookingDetailModal(b, {
          onUpdated: syncLocal,
          onCancelled: syncLocal,
          onDeleted: (deleted) => {
            allBookings = allBookings.filter(x => String(x.id) !== String(deleted.id));
            filteredBookings = filteredBookings.filter(x => String(x.id) !== String(deleted.id));
            updateTabCounts();
            render(filteredBookings);
          }
        });
      });
    });
  };

  const updateTabCounts = () => {
    if (!tabsContainer) return;
    const scoped = allBookings.filter(filterFn);
    tabsContainer.querySelectorAll(".admin-tab").forEach(tab => {
      const status = tab.dataset.status;
      const count = status === "all"
        ? scoped.length
        : scoped.filter(b => b.status.toLowerCase() === status).length;
      const countEl = tab.querySelector(".admin-tab__count");
      if (countEl) countEl.textContent = count;
    });
  };

  const applyFilters = () => {
    const query = searchInput.value.toLowerCase();
    const from = filterDateFrom?.value;
    const to = filterDateTo?.value;

    updateTabCounts();

    filteredBookings = allBookings.filter(filterFn).filter(b => {
      const matchesSearch =
        b.customerName.toLowerCase().includes(query) ||
        b.customerEmail.toLowerCase().includes(query) ||
        b.tourName.toLowerCase().includes(query);

      const matchesStatus = currentTab === "all" || b.status.toLowerCase() === currentTab;
      const matchesDate = (!from || b.date >= from) && (!to || b.date <= to);

      return matchesSearch && matchesStatus && matchesDate;
    });
  };

  const handleFilters = () => {
    applyFilters();
    currentPage = 1; // Reset to page 1 on filter
    render(filteredBookings);
  };

  const loadData = async () => {
    const listEl = document.getElementById(cardsElId);
    if (listEl) {
      listEl.innerHTML = Array.from({ length: 4 }).map(() => `
        <div class="skeleton-card" style="min-height:56px;padding:0.85rem 1.1rem;margin-bottom:0.6rem;">
          <div class="skeleton-line skeleton-line--short"></div>
          <div class="skeleton-line"></div>
        </div>
      `).join("");
    }
    currentPage = 1;
    allBookings = await fetchBookings({ source });
    allBookings.sort((a, b) => new Date(a.start) - new Date(b.start));
    applyFilters();
    render(filteredBookings);
  };

  searchInput?.addEventListener("input", handleFilters);
  filterDateFrom?.addEventListener("change", handleFilters);
  filterDateTo?.addEventListener("change", handleFilters);
  refreshBtn?.addEventListener("click", loadData);

  document.getElementById("new-booking-btn")?.addEventListener("click", () => {
    openCreateBookingModal(async (payload) => {
      const res = await fetch("/api/admin/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      if (result.warning) {
        await adminAlert(`Booking created, but: ${result.warning}`, "error");
      } else {
        await adminAlert("Booking created successfully!", "success");
      }
      await loadData();
    });
  });

  tabsContainer?.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      tabsContainer.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.status;
      handleFilters();
    });
  });

  loadData();
}

/**
 * Shared helpers: "notifications" (bookings created/cancelled in the last 48h)
 * panel + badges. Used by both the Dashboard sidebar badges and the
 * dedicated /admin/notifications.html page.
 *
 * Each entry gets a `notifType`: 'new' (reservation/booking created) or
 * 'cancelled' (booking cancelled) — GYG cancellations land here with the
 * same createdAt-based recency filter as new ones, just tagged differently.
 */
function getNotifications(bookings) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return bookings
    .filter(b => b.createdAt && b.createdAt.getTime() >= cutoff)
    // Drop unconfirmed GYG holds (checkout in progress / abandoned) — no
    // customer yet, nothing to act on until GYG calls /book/ or /cancel-reservation/.
    .filter(b => !(b.status === 'RESERVED' && !b.customerEmail))
    .map(b => ({ ...b, notifType: b.status === 'CANCELLED' ? 'cancelled' : 'new' }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function updateNavBadges(bookings) {
  const notifications = getNotifications(bookings);
  const newGyg = notifications.filter(b => b.isGyg && b.notifType === 'new');

  const allBadge = document.getElementById("notifications-nav-badge");
  if (allBadge && notifications.length > 0) {
    allBadge.textContent = notifications.length;
    allBadge.style.display = "inline-block";
  }

  const gygBadge = document.getElementById("gyg-nav-badge");
  if (gygBadge && newGyg.length > 0) {
    gygBadge.textContent = newGyg.length;
    gygBadge.style.display = "inline-block";
  }
}

function renderNewBookingsPanel(bookings) {
  const listEl = document.getElementById("new-bookings-list");
  const countEl = document.getElementById("new-bookings-count");
  if (!listEl || !countEl) return;

  const now = Date.now();
  const notifications = getNotifications(bookings);
  countEl.textContent = notifications.length;

  if (notifications.length === 0) {
    listEl.innerHTML = `<div style="padding:0.75rem 0;color:rgba(255,255,255,0.5);font-size:0.85rem;">No activity in the last 48h.</div>`;
    return;
  }

  listEl.innerHTML = notifications.map(b => {
    const hoursAgo = Math.round((now - b.createdAt.getTime()) / (60 * 60 * 1000));
    const timeAgo = hoursAgo < 1 ? "just now" : `${hoursAgo}h ago`;
    const d = new Date(b.start);
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const isCancelled = b.notifType === 'cancelled';
    const tagColor = isCancelled ? '#e35d5d' : '#4caf7d';
    const tagLabel = isCancelled ? 'Cancelled' : 'New';
    return `
      <div class="new-booking-item">
        <div class="new-booking-item__main">
          <span class="new-booking-item__name">
            <span style="display:inline-block;font-size:0.7rem;font-weight:600;color:${tagColor};border:1px solid ${tagColor};border-radius:4px;padding:0 5px;margin-right:6px;vertical-align:middle;">${tagLabel}</span>
            ${b.customerName}${b.isGyg ? ' <span style="opacity:0.5;">(GYG)</span>' : ''}
          </span>
          <span class="new-booking-item__meta">${b.tourName} · ${dateStr} @ ${b.time.substring(0, 5)} · ${b.passengers} pax</span>
        </div>
        <span class="new-booking-item__time">${timeAgo}</span>
      </div>
    `;
  }).join("");
}

/**
 * NOTIFICATIONS PAGE (last 48h: new reservations + cancellations, own + GetYourGuide)
 */
async function initNotificationsPage() {
  const refreshBtn = document.getElementById("refresh-notifications");

  const load = async () => {
    const listEl = document.getElementById("new-bookings-list");
    if (listEl) listEl.innerHTML = `<div class="po-spinner" style="margin: 2rem auto;"></div>`;
    const bookings = await fetchAllBookings();
    renderNewBookingsPanel(bookings);
    updateNavBadges(bookings);
  };

  refreshBtn?.addEventListener("click", load);
  load();
}

/**
 * STATS PAGE (Charts)
 */
let charts = {}; // To store chart instances for destruction

const GYG_COMMISSION = 0.3; // GetYourGuide keeps 30% of the booking price
function effectivePrice(b) {
  return b.isGyg ? b.price * (1 - GYG_COMMISSION) : b.price;
}

async function initStatsPage() {
  const btn = document.getElementById("apply-filters");
  const fromInput = document.getElementById("filter-date-from");
  const toInput = document.getElementById("filter-date-to");
  const scopeTabs = document.getElementById("stats-scope-tabs");

  let allBookings = await fetchAllBookings();
  let currentScope = "own";

  const updateStats = () => {
    const from = fromInput?.value;
    const to = toInput?.value;

    const filtered = allBookings.filter(b => {
      const matchesDate = (!from || b.date >= from) && (!to || b.date <= to);
      const matchesScope = currentScope === "combined" ? true : currentScope === "gyg" ? b.isGyg : !b.isGyg;
      return matchesDate && matchesScope;
    });

    const paid = filtered.filter(b => b.status === "PAID");

    // Basic Stats (GYG bookings are netted -30% via effectivePrice)
    const totalRev = paid.reduce((sum, b) => sum + effectivePrice(b), 0);
    const totalPax = paid.reduce((sum, b) => sum + b.passengers, 0);
    const avgVal = paid.length > 0 ? totalRev / paid.length : 0;

    document.getElementById("stat-revenue").textContent = formatCurrency(totalRev);
    document.getElementById("stat-bookings").textContent = paid.length;
    document.getElementById("stat-avg").textContent = formatCurrency(avgVal);
    document.getElementById("stat-passengers").textContent = totalPax;

    try {
      // 1. Hourly Heatmap
      const hourCounts = Array(24).fill(0);
      paid.forEach(b => {
        const hour = parseInt(b.time.split(':')[0]);
        if (!isNaN(hour) && hour >= 0 && hour < 24) hourCounts[hour]++;
      });
      renderBarChart('chart-hours', Array.from({ length: 24 }, (_, i) => `${i}:00`), hourCounts, 'Bookings by Hour');

      // 2. Weekday Performance
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayRev = Array(7).fill(0);
      paid.forEach(b => {
        const day = new Date(b.start).getDay();
        dayRev[day] += effectivePrice(b);
      });
      renderBarChart('chart-weekdays', dayNames, dayRev, 'Revenue by Day (€)', '#4ade80');

      // 4. Language Distribution
      const langCounts = {};
      paid.forEach(b => {
        langCounts[b.lang] = (langCounts[b.lang] || 0) + 1;
      });
      renderPieChart('chart-languages', Object.keys(langCounts), Object.values(langCounts));
    } catch (err) {
      console.error("Chart rendering failed:", err);
    }

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

  scopeTabs?.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      scopeTabs.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentScope = tab.dataset.scope;
      updateStats();
    });
  });

  updateStats();
}

/**
 * CAPTAIN'S MANIFEST
 */
let manifestDate = new Date();
let manifestBookingsCache = null;

function manifestDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function renderManifestFor(date) {
  const container = document.getElementById("manifest-container");
  const dateHeader = document.getElementById("manifest-date");
  if (!container) return;

  const dateStr = manifestDateKey(date);
  if (dateHeader) dateHeader.textContent = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (!manifestBookingsCache) manifestBookingsCache = await fetchAllBookings();
  const dayBookings = manifestBookingsCache
    .filter(b => b.date === dateStr && b.status === "PAID")
    .sort((a, b) => a.time.localeCompare(b.time));

  if (dayBookings.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 4rem; opacity: 0.5;">No bookings scheduled. Enjoy the calm! ⚓</div>`;
  } else {
    container.innerHTML = dayBookings.map(b => `
      <button type="button" class="manifest-item" data-booking-id="${b.id}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;font-family:inherit;">
        <div class="manifest-item__info">
          <div class="manifest-item__time">${b.time.substring(0, 5)}</div>
          <div class="manifest-item__name">${b.customerName}</div>
          <div class="manifest-item__meta">${b.tourName} • ${b.lang.toUpperCase()}</div>
        </div>
        <div class="manifest-item__pax">
          <span class="manifest-item__pax-num">${b.passengers}</span>
          <span class="manifest-item__pax-label">Pax</span>
        </div>
      </button>
    `).join("");

    container.querySelectorAll(".manifest-item").forEach(item => {
      item.addEventListener("click", () => {
        const b = manifestBookingsCache.find(x => String(x.id) === item.dataset.bookingId);
        if (!b) return;
        openBookingDetailModal(b, {
          onUpdated: () => renderManifestFor(manifestDate),
          onCancelled: () => renderManifestFor(manifestDate),
          onDeleted: (deleted) => {
            manifestBookingsCache = manifestBookingsCache.filter(x => String(x.id) !== String(deleted.id));
            renderManifestFor(manifestDate);
          }
        });
      });
    });
  }
}

async function initManifestPage() {
  // Today's Agenda is fixed to the current day by design — day navigation
  // lives in /admin/calendar.html instead.
  manifestDate = new Date();
  await renderManifestFor(manifestDate);
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

