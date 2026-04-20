import {
  EXTRA_CHARCUTERIE,
  formatCurrency,
  getBooking,
  getTour,
  readBookingFromUrl,
  saveBooking,
  clearBookingSelection,
  TOURS,
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
    phone: document.getElementById("reserve-phone"),
    complete: document.getElementById("complete-request-btn"),
    dateDisplay: document.getElementById("reserve-date-display"),
    timeDisplay: document.getElementById("reserve-time-display"),
    editLinks: document.querySelectorAll(".selection-card__edit-link"),
    peopleDisplay: document.getElementById("reserve-people-display"),
    peopleMinus: document.getElementById("reserve-people-minus"),
    peoplePlus: document.getElementById("reserve-people-plus"),
    langDisplay: document.getElementById("reserve-lang-display"),
    langToggle: document.getElementById("reserve-lang-toggle"),
  };

  let current = saveBooking({
    tour: tour.id,
    qty: booking.qty || 1,
    tapas: booking.tapas || 0,
    date: booking.date || "",
    time: booking.time || "",
    lang: booking.lang || "english",
  });

  if (elements.name) elements.name.value = current.contact?.name || "";
  if (elements.email) elements.email.value = current.contact?.email || "";

  function render() {
    const currentTour = getTour(current.tour) || tour;
    const tapasTotal = current.tapas * EXTRA_CHARCUTERIE.price;
    const total = currentTour.price + tapasTotal;

    if (elements.tourImg) {
      elements.tourImg.src = currentTour.img;
      elements.tourImg.alt = currentTour.title;
    }
    if (elements.tourTitle) elements.tourTitle.textContent = currentTour.title;
    if (elements.tourDuration) elements.tourDuration.textContent = currentTour.duration;
    if (elements.summaryTourName) elements.summaryTourName.textContent = currentTour.title;
    if (elements.summaryTourPrice) elements.summaryTourPrice.textContent = formatCurrency(currentTour.price);
    if (elements.tapasQty) elements.tapasQty.textContent = String(current.tapas);
    if (elements.summaryTotal) elements.summaryTotal.textContent = formatCurrency(total);

    if (elements.dateDisplay) {
      elements.dateDisplay.textContent = current.date ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(new Date(current.date + "T00:00:00")) : "Select a date";
    }
    if (elements.timeDisplay) {
      elements.timeDisplay.textContent = current.time || "Select a time";
    }
    if (elements.peopleDisplay) {
      elements.peopleDisplay.textContent = String(current.qty || 1);
    }
    if (elements.peopleMinus) {
      elements.peopleMinus.disabled = (current.qty || 1) <= 1;
    }
    if (elements.peoplePlus) {
      elements.peoplePlus.disabled = (current.qty || 1) >= 8;
    }
    if (elements.langDisplay) {
      elements.langDisplay.textContent = current.lang === "spanish" ? "Spanish" : "English";
    }

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

  elements.peoplePlus?.addEventListener("click", () => {
    current = saveBooking({ qty: Math.min(8, (current.qty || 1) + 1) });
    render();
  });

  elements.peopleMinus?.addEventListener("click", () => {
    current = saveBooking({ qty: Math.max(1, (current.qty || 1) - 1) });
    render();
  });

  elements.langToggle?.addEventListener("click", () => {
    current = saveBooking({ lang: current.lang === "spanish" ? "english" : "spanish" });
    render();
  });

  elements.editLinks?.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tour = TOURS[current.tour];
      if (tour && tour.url) {
        window.location.href = tour.url;
      } else {
        window.history.back();
      }
    });
  });

  elements.complete?.addEventListener("click", async () => {
    const name = elements.name ? elements.name.value.trim() : "";
    const email = elements.email ? elements.email.value.trim() : "";
    const phone = elements.phone ? elements.phone.value.trim() : "";

    if (!name || !email || !phone) {
      window.alert("Please fill in all contact details (Name, Email, and Phone) before confirming.");
      return;
    }

    // ! IMPORTANT: The user must replace this with their actual Google Apps Script Web App URL
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwF-2rfhCCY_rU2je00fVyx7eeMb-MmgkjNTmHkz-N2_1nyxXKgTetCfFzoT5K5mAHkxQ/exec";

    elements.complete.disabled = true;
    elements.complete.textContent = "Processing...";

    const bookingData = {
      ...current,
      contact: { name, email, phone }
    };

    // If no URL is set, simulate success for testing
    if (!GAS_URL || GAS_URL.includes("YOUR_GA_URL")) {
      console.warn("GAS_URL not set in reserve.js. Simulating success.");
      setTimeout(() => {
        window.alert(
          `Success! Your request for ${tour.title} on ${bookingData.date} at ${bookingData.time} has been received. We'll be in touch shortly!`
        );
        elements.complete.disabled = false;
        elements.complete.textContent = "Complete My Booking";
      }, 1000);
      return;
    }

    try {
      const dataStr = encodeURIComponent(JSON.stringify({
        ...bookingData,
        name,
        email,
        phone,
        tour: tour.title,
      }));
      
      const url = `${GAS_URL}?action=createBooking&data=${dataStr}`;
      
      // MASTER KEY: Using an Image object to send data bypasses all browser CORS restrictions.
      // This is the most reliable way to trigger a GAS execution from a static website.
      const beacon = new Image();
      beacon.src = url;
      
      // Small delay to ensure the request is dispatched before the alert/redirect
      setTimeout(() => {
        window.alert(
          `Wonderful! Your request for the ${tour.title} is on its way. We'll check the logistics and send you a confirmation email very soon.`
        );
        clearBookingSelection();
        window.location.href = "/";
      }, 700);
    } catch (error) {
      console.error("Booking error:", error);
      window.alert("Apologies, we encountered a small issue. Please try again or contact us directly via WhatsApp.");
      elements.complete.disabled = false;
      elements.complete.textContent = "Complete My Booking";
    }
  });

  // UI initialized
  render();
}
