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
  const tour = getTour(booking.tour);

  console.log("Reservation Page: Current Tour ID:", tour?.id);

  if (!tour) {
    // If no tour found, redirect back to booking page to avoid error
    window.location.href = "/book";
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
    tourDisplay: document.getElementById("reserve-tour-display"),
    scheduleDisplay: document.getElementById("reserve-schedule-display"),
    editLinks: document.querySelectorAll(".selection-card__edit-link"),
    peopleDisplay: document.getElementById("reserve-people-display"),
    peopleLabel: document.getElementById("reserve-people-label"),
    langDisplay: document.getElementById("reserve-lang-display"),
    stickyBar: document.getElementById("mobile-sticky-bar"),
    stickyTotal: document.getElementById("sticky-total"),
    stickyBtn: document.getElementById("sticky-complete-btn"),
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
      elements.tourImg.onload = () => { elements.tourImg.style.opacity = "1"; };
    }
    if (elements.tourDisplay) elements.tourDisplay.textContent = currentTour.title;
    if (elements.tourTitle) elements.tourTitle.textContent = currentTour.title;
    if (elements.tourDuration) elements.tourDuration.textContent = currentTour.duration;
    if (elements.summaryTourName) elements.summaryTourName.textContent = currentTour.title;
    if (elements.summaryTourPrice) elements.summaryTourPrice.textContent = formatCurrency(currentTour.price);
    if (elements.tapasQty) elements.tapasQty.textContent = String(current.tapas);

    const formattedTotal = formatCurrency(total);
    if (elements.summaryTotal) elements.summaryTotal.textContent = formattedTotal;
    if (elements.stickyTotal) elements.stickyTotal.textContent = formattedTotal;

    if (elements.scheduleDisplay) {
      if (current.date && current.time) {
        const dateObj = new Date(current.date + "T00:00:00");
        const dateStr = new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(dateObj);
        elements.scheduleDisplay.textContent = `${dateStr}, starts at ${current.time}`;
      } else if (current.date) {
        const dateObj = new Date(current.date + "T00:00:00");
        const dateStr = new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(dateObj);
        elements.scheduleDisplay.textContent = dateStr;
      } else {
        elements.scheduleDisplay.textContent = "Select a date & time";
      }
    }
    if (elements.peopleDisplay) {
      elements.peopleDisplay.textContent = String(current.qty || 1);
    }
    if (elements.peopleLabel) {
      elements.peopleLabel.textContent = (current.qty || 1) === 1 ? "person" : "people";
    }
    if (elements.peopleMinus) {
      elements.peopleMinus.disabled = (current.qty || 1) <= 1;
    }
    if (elements.peoplePlus) {
      elements.peoplePlus.disabled = (current.qty || 1) >= 8;
    }
    if (elements.langDisplay) {
      if (current.lang === "spanish") elements.langDisplay.textContent = "Spanish";
      else if (current.lang === "danish") elements.langDisplay.textContent = "Danish";
      else elements.langDisplay.textContent = "English";
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

  // Note: Tapas editing and People editing are now done on the previous page
  // Tapas can still be updated via the Tapas Box section if the user chooses to keep those buttons there
  // but for narrative consistency, we are removing them from the sidebar.

  elements.tapasPlus?.addEventListener("click", () => updateTapas(1));
  elements.tapasMinus?.addEventListener("click", () => updateTapas(-1));

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

  async function handleCompleteBooking() {
    // 1. Validate contact info
    const name = elements.name ? elements.name.value.trim() : "";
    const email = elements.email ? elements.email.value.trim() : "";
    const phone = elements.phone ? elements.phone.value.trim() : "";

    if (!name || !email || !phone) {
      window.alert("Please fill in all contact details (Name, Email, and Phone) before continuing.");
      return;
    }

    const buttons = [elements.complete, elements.stickyBtn].filter(Boolean);
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "Initiating Payment...";
    });

    const currentTour = getTour(current.tour) || tour;
    const tapasTotal = current.tapas * EXTRA_CHARCUTERIE.price;
    const total = currentTour.price + tapasTotal;

    try {
      // 1. Create a DRAFT (PENDING) booking in Google Calendar first
      const draftBookingData = {
        ...current,
        contact: { name, email, phone },
        name: name,
        email: email,
        phone: phone,
        tourTitle: currentTour.title,
        tour: currentTour.title, // GAS expects 'tour' string
        calendar: currentTour.calendar || "boat1",
        payment_status: "PENDING"
      };

      const draftResponse = await fetch("/api/proxy?action=createBooking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBookingData)
      });

      if (!draftResponse.ok) throw new Error("Failed to create draft booking on server.");
      const draftResult = await draftResponse.json();
      const eventId = draftResult.eventId;

      if (!eventId) throw new Error("Server failed to return a reservation ID.");

      // 2. Prepare SumUp Checkout data using eventId as the absolute reference
      const checkoutData = {
        amount: total,
        currency: "DKK",
        checkout_reference: eventId, // CRITICAL: This links payment to the specific Google Event
        return_url: `${window.location.origin}/reserve/success.html`,
        description: `Seaduced Experience: ${currentTour.title}`
      };

      const response = await fetch("/api/sumup?action=createCheckout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutData)
      });

      const checkout = await response.json();

      if (response.ok && checkout.hosted_checkout_url) {
        // Save local backup just in case
        localStorage.setItem("pending_booking_id", eventId);
        localStorage.setItem("pending_booking_data", JSON.stringify(draftBookingData));

        window.location.href = checkout.hosted_checkout_url;
      } else {
        console.error("SumUp Proxy Error:", checkout);
        throw new Error(checkout.error || checkout.message || "Failed to create checkout session");
      }

    } catch (error) {
      console.error("Payment initiation error:", error);
      window.alert("Apologies, we encountered an issue initiating your payment. Please try again or contact us directly via WhatsApp.");
      buttons.forEach(btn => {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || "Confirm & Proceed to Payment";
      });
    }
  }

  elements.complete?.addEventListener("click", handleCompleteBooking);
  elements.stickyBtn?.addEventListener("click", handleCompleteBooking);

  // Intersection Observer to hide sticky bar when main button is visible
  if (elements.stickyBar && elements.complete) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          elements.stickyBar.classList.add("hidden");
        } else {
          elements.stickyBar.classList.remove("hidden");
        }
      });
    }, { threshold: 0.1 });

    observer.observe(elements.complete);
  }

  // UI initialized
  render();
}
