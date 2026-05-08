import { formatCurrency, TOURS } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;

  if (path.endsWith("/admin/bookings") || path.includes("/admin/bookings.html")) {
    initBookingsPage();
  } else if (path.endsWith("/admin/stats") || path.includes("/admin/stats.html")) {
    initStatsPage();
  } else if (path.endsWith("/admin/manifest") || path.includes("/admin/manifest.html")) {
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
        lang: b.lang || 'english'
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
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.4);">No bookings found for this period.</td></tr>`;
      renderPagination(0);
      return;
    }

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
          <td>${b.tourName}</td>
          <td>${b.passengers} pax</td>
          <td><span style="text-transform: capitalize;">${b.calendar}</span></td>
          <td>
            <span class="badge-status status-${b.status.toLowerCase()}">${b.status}</span>
          </td>
        </tr>
      `;
    }).join("");

    renderPagination(data.length);
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 4rem;"><div class="po-spinner" style="margin: 0 auto 1rem;"></div>Loading bookings...</td></tr>`;
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
    renderBarChart('chart-hours', Array.from({length: 24}, (_, i) => `${i}:00`), hourCounts, 'Bookings by Hour');

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

