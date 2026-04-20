import { getBooking, readBookingFromUrl, saveBooking, clearBookingSelection } from "./utils.js";

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
}
