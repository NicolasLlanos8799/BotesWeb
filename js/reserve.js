import {
  EXTRA_CHARCUTERIE,
  formatCurrency,
  getBooking,
  getTour,
  readBookingFromUrl,
  saveBooking,
} from "./utils.js";

export function initReservePage() {
  const incoming = readBookingFromUrl();
  const hasIncomingSelection = Boolean(incoming.tour);
  const booking = hasIncomingSelection ? saveBooking(incoming) : getBooking();
  const tour = getTour(booking.tour) || getTour("book-1h");

  if (!tour) {
    return;
  }

  const elements = {
    tourImg: document.getElementById("tour-img"),
    tourTitle: document.getElementById("tour-title"),
    tourDuration: document.getElementById("tour-duration"),
    summaryTourName: document.getElementById("summary-tour-name"),
    summaryTourPrice: document.getElementById("summary-tour-price"),
    summaryExtra: document.getElementById("summary-extra-container"),
    summaryTotal: document.getElementById("summary-total"),
    tapasQty: document.getElementById("tapas-qty-display"),
    tapasPlus: document.getElementById("tapas-plus"),
    tapasMinus: document.getElementById("tapas-minus"),
    name: document.getElementById("reserve-name"),
    email: document.getElementById("reserve-email"),
    complete: document.getElementById("complete-request-btn"),
    calendarIframe: document.getElementById("calendar-iframe"),
    calendarPlaceholder: document.getElementById("calendar-placeholder"),
  };

  let current = saveBooking({
    tour: tour.id,
    qty: booking.qty || 1,
    tapas: booking.tapas || 0,
    date: booking.date || "",
    lang: booking.lang || "english",
  });

  elements.name.value = current.contact?.name || "";
  elements.email.value = current.contact?.email || "";

  function render() {
    const currentTour = getTour(current.tour) || tour;
    const tapasTotal = current.tapas * EXTRA_CHARCUTERIE.price;
    const total = currentTour.price + tapasTotal;

    elements.tourImg.src = currentTour.img;
    elements.tourImg.alt = currentTour.title;
    elements.tourTitle.textContent = currentTour.title;
    elements.tourDuration.textContent = currentTour.duration;
    elements.summaryTourName.textContent = currentTour.title;
    elements.summaryTourPrice.textContent = formatCurrency(currentTour.price);
    elements.tapasQty.textContent = String(current.tapas);
    elements.summaryTotal.textContent = formatCurrency(total);

    if (current.tapas > 0) {
      elements.summaryExtra.style.display = "flex";
      elements.summaryExtra.innerHTML = `<span>${EXTRA_CHARCUTERIE.title} (x${current.tapas})</span><span>${formatCurrency(tapasTotal)}</span>`;
    } else {
      elements.summaryExtra.style.display = "none";
      elements.summaryExtra.innerHTML = "";
    }
  }

  function updateTapas(delta) {
    current = saveBooking({
      tour: current.tour,
      tapas: Math.max(0, current.tapas + delta),
    });
    render();
  }

  elements.tapasPlus?.addEventListener("click", () => updateTapas(1));
  elements.tapasMinus?.addEventListener("click", () => updateTapas(-1));

  elements.complete?.addEventListener("click", () => {
    const name = elements.name.value.trim();
    const email = elements.email.value.trim();

    if (!name || !email) {
      window.alert("Please fill in your contact information.");
      return;
    }

    current = saveBooking({
      contact: { name, email },
    });

    window.alert(
      `Your request for ${tour.title} has been sent. Please make sure you also completed the calendar slot above.`
    );
  });

  if (elements.calendarIframe?.src.includes("AcZssZ")) {
    elements.calendarPlaceholder.style.display = "flex";
    elements.calendarIframe.style.display = "none";
  }

  render();
}
