import { getBooking, readBookingFromUrl, saveBooking } from "./utils.js";

export function initBookingPage() {
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
