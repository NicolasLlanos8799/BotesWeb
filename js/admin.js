console.log("CRITICAL: Admin JS file reached by browser!");

import { formatCurrency, TOURS } from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  console.log("Admin JS loaded. Path:", path);

  if (path.endsWith("/admin/bookings") || path.includes("/admin/bookings.html")) {
    console.log("Initializing Bookings Page...");
    initBookingsPage();
  } else if (path.endsWith("/admin/stats") || path.includes("/admin/stats.html")) {
    console.log("Initializing Stats Page...");
    initStatsPage();
  } else if (path === "/admin" || path === "/admin/" || path.includes("/admin/index.html")) {
    console.log("Initializing Dashboard...");
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
    console.log("Admin Data Received:", data);
    
    return data.bookings.map(b => {
      // Handle MySQL date objects vs strings
      const datePart = b.booking_date ? new Date(b.booking_date).toISOString().split('T')[0] : '2026-01-01';
      const timePart = b.booking_time || '00:00:00';
      
      return {
        id: b.id,
        start: `${datePart}T${timePart}`,
        tourName: b.tour_name,
        customerName: b.customer_name,
        customerEmail: b.customer_email,
        customerPhone: b.customer_phone,
        passengers: b.passengers,
        status: b.payment_status,
        price: parseFloat(b.total_price) || 0,
        calendar: b.tour_id || 'N/A'
      };
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    return [];
  }
}

// Manual parser removed as we now use structured SQL data


/**
 * DASHBOARD PAGE
 */
function initDashboard() {
  console.log("Admin Dashboard Initialized");
}

/**
 * BOOKINGS PAGE
 */
async function initBookingsPage() {
  const tbody = document.getElementById("bookings-tbody");
  const searchInput = document.getElementById("booking-search");
  const filterStatus = document.getElementById("booking-filter-status");
  const refreshBtn = document.getElementById("refresh-bookings");

  let allBookings = [];

  const render = (data) => {
    if (!tbody) return;
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.4);">No bookings found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(b => {
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
  };

  const handleFilters = () => {
    const query = searchInput.value.toLowerCase();
    const status = filterStatus.value.toLowerCase();

    const filtered = allBookings.filter(b => {
      const matchesSearch = 
        b.customerName.toLowerCase().includes(query) || 
        b.customerEmail.toLowerCase().includes(query) || 
        b.tourName.toLowerCase().includes(query);
      
      const matchesStatus = status === "all" || b.status.toLowerCase() === status;
      
      return matchesSearch && matchesStatus;
    });

    render(filtered);
  };

  const loadData = async () => {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 4rem;"><div class="po-spinner" style="margin: 0 auto 1rem;"></div>Loading bookings...</td></tr>`;
    allBookings = await fetchAllBookings();
    // Sort by date (newest first)
    allBookings.sort((a, b) => new Date(b.start) - new Date(a.start));
    render(allBookings);
  };

  searchInput?.addEventListener("input", handleFilters);
  filterStatus?.addEventListener("change", handleFilters);
  refreshBtn?.addEventListener("click", loadData);

  loadData();
}

/**
 * STATS PAGE
 */
async function initStatsPage() {
  const elements = {
    revenue: document.getElementById("stat-revenue"),
    bookings: document.getElementById("stat-bookings"),
    avg: document.getElementById("stat-avg"),
    passengers: document.getElementById("stat-passengers"),
    distribution: document.getElementById("tour-distribution")
  };

  const bookings = await fetchAllBookings();
  const paidBookings = bookings.filter(b => b.status === "PAID");

  // Calculations
  const totalRevenue = paidBookings.reduce((sum, b) => sum + b.price, 0);
  const totalPassengers = paidBookings.reduce((sum, b) => sum + b.passengers, 0);
  const avgValue = paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0;

  // Render Stats
  if (elements.revenue) elements.revenue.textContent = formatCurrency(totalRevenue);
  if (elements.bookings) elements.bookings.textContent = paidBookings.length;
  if (elements.avg) elements.avg.textContent = formatCurrency(avgValue);
  if (elements.passengers) elements.passengers.textContent = totalPassengers;

  // Render Distribution
  if (elements.distribution) {
    const counts = {};
    paidBookings.forEach(b => {
      counts[b.tourName] = (counts[b.tourName] || 0) + 1;
    });

    const sortedTours = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
    if (sortedTours.length === 0) {
      elements.distribution.innerHTML = `<p style="opacity: 0.5;">No data available for stats yet.</p>`;
    } else {
      elements.distribution.innerHTML = sortedTours.map(([name, count]) => {
        const percentage = Math.round((count / paidBookings.length) * 100);
        return `
          <div style="margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.9rem;">
              <span>${name}</span>
              <span style="font-weight: 700;">${count} bookings (${percentage}%)</span>
            </div>
            <div style="height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; background: var(--admin-accent); width: ${percentage}%;"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}
