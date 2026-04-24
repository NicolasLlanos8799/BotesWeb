import { getBooking, readBookingFromUrl, saveBooking, clearBookingSelection, savePersistentCache } from "./utils.js";

export function initBookingPage() {
  // Reset temporal data but keep tour context if from URL
  const currentTour = readBookingFromUrl().tour;
  clearBookingSelection();
  if (currentTour) {
    saveBooking({ tour: currentTour });
  }

  const incoming = readBookingFromUrl();
  if (incoming.tour) {
    saveBooking(incoming);
  }

  const booking = getBooking();
  if (!booking.tour) {
    return;
  }

  const selectedCard = document.getElementById(booking.tour);
  if (!selectedCard) {
    return;
  }

  selectedCard.classList.add("booking-card--selected");
  selectedCard.setAttribute("aria-current", "true");

  // --- BACKGROUND PRE-FETCHING ---
  // Start syncing all calendars as soon as the user is browsing the catalog
  preFetchAllCalendars();
}

const GAS_URL = "/api/proxy";

async function preFetchAllCalendars() {
  const calendars = ["boat1", "boat2"];
  const now = new Date();
  
  // SYNC 4 MONTHS FOR ALL BOATS
  const monthsToPreload = [0, 1, 2, 3];
  
  for (const cal of calendars) {
    for (const offset of monthsToPreload) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      
      fetch(`${GAS_URL}?action=getMonthlyAvailability&date=${dateStr}&calendar=${cal}&t=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
          if (data && typeof data === 'object') {
            savePersistentCache(cal, data);
          }
        })
        .catch(() => {});
    }
  }
}
