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

  // ── Payment Overlay Helpers ──────────────────────────────────────────────
  let pollingInterval = null;
  let pollingTimeout = null;
  let currentCheckoutId = null;

  function getOverlay() {
    return document.getElementById("payment-overlay");
  }

  function showPaymentWaitingUI() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.classList.add("active");
    // Lock body scroll
    document.body.style.overflow = "hidden";

    // Update inner state
    const icon = overlay.querySelector(".po-icon");
    const title = overlay.querySelector(".po-title");
    const message = overlay.querySelector(".po-message");
    const hint = overlay.querySelector(".po-hint");
    const actions = overlay.querySelector(".po-actions");
    const progress = overlay.querySelector(".po-progress-bar");

    if (icon) icon.innerHTML = `<div class="po-spinner"></div>`;
    if (title) title.textContent = "Complete your payment";
    if (message) message.textContent = "A new tab has been opened with the secure SumUp payment page. Please complete your payment there.";
    if (hint) { hint.style.display = "block"; hint.textContent = "We'll automatically confirm your booking once payment is received."; }
    if (actions) actions.innerHTML = `<button class="po-btn po-btn--secondary" id="po-cancel-btn">Cancel Payment</button>`;
    if (progress) progress.style.display = "block";

    // Wire cancel
    const cancelBtn = document.getElementById("po-cancel-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        hidePaymentOverlay();
        resetButtons();
      });
    }
  }

  function showSuccessUI(tourTitle) {
    const overlay = getOverlay();
    if (!overlay) return;

    const icon = overlay.querySelector(".po-icon");
    const title = overlay.querySelector(".po-title");
    const message = overlay.querySelector(".po-message");
    const hint = overlay.querySelector(".po-hint");
    const actions = overlay.querySelector(".po-actions");
    const progress = overlay.querySelector(".po-progress-bar");
    const card = overlay.querySelector(".po-card");

    if (card) card.classList.add("po-card--success");
    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg class="po-checkmark" viewBox="0 0 52 52">
        <circle class="po-checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="po-checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
      </svg>`;
    if (title) title.textContent = "Payment Confirmed!";
    if (message) message.innerHTML = tourTitle
      ? `Your booking for <strong>"${tourTitle}"</strong> has been successfully created.`
      : "Your booking has been successfully created.";
    if (hint) { hint.style.display = "block"; hint.textContent = "A confirmation email with a calendar invite has been sent to your inbox."; }
    if (actions) actions.innerHTML = `<a href="/" class="po-btn po-btn--primary">Return to Homepage</a>`;
  }

  function showErrorUI(errorMessage) {
    const overlay = getOverlay();
    if (!overlay) return;

    const icon = overlay.querySelector(".po-icon");
    const title = overlay.querySelector(".po-title");
    const message = overlay.querySelector(".po-message");
    const hint = overlay.querySelector(".po-hint");
    const actions = overlay.querySelector(".po-actions");
    const progress = overlay.querySelector(".po-progress-bar");
    const card = overlay.querySelector(".po-card");

    if (card) card.classList.add("po-card--error");
    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#c62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
    if (title) title.textContent = "Payment Issue";
    if (message) message.textContent = errorMessage || "Your payment could not be processed. Please try again.";
    if (hint) hint.style.display = "none";
    if (actions) actions.innerHTML = `
      <button class="po-btn po-btn--primary" id="po-retry-btn">Try Again</button>
      <a href="/" class="po-btn po-btn--secondary">Return to Homepage</a>`;

    const retryBtn = document.getElementById("po-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        hidePaymentOverlay();
        resetButtons();
      });
    }
  }

  function showTimeoutUI() {
    const overlay = getOverlay();
    if (!overlay) return;

    const icon = overlay.querySelector(".po-icon");
    const title = overlay.querySelector(".po-title");
    const message = overlay.querySelector(".po-message");
    const hint = overlay.querySelector(".po-hint");
    const actions = overlay.querySelector(".po-actions");
    const progress = overlay.querySelector(".po-progress-bar");

    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#f57c00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>`;
    if (title) title.textContent = "Taking longer than expected";
    if (message) message.textContent = "We haven't received payment confirmation yet. If you completed the payment, please wait a moment or contact us.";
    if (hint) { hint.style.display = "block"; hint.textContent = "If the payment tab is still open, please complete it there."; }
    if (actions) actions.innerHTML = `
      <button class="po-btn po-btn--primary" id="po-resume-btn">Keep Waiting</button>
      <a href="/" class="po-btn po-btn--secondary">Return to Homepage</a>`;

    const resumeBtn = document.getElementById("po-resume-btn");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => {
        // Restart polling for another 5 min
        showPaymentWaitingUI();
        startPaymentPolling(currentCheckoutId);
      });
    }
  }

  function hidePaymentOverlay() {
    const overlay = getOverlay();
    if (overlay) {
      overlay.classList.remove("active");
      const card = overlay.querySelector(".po-card");
      if (card) card.classList.remove("po-card--success", "po-card--error");
    }
    document.body.style.overflow = "";
    stopPolling();
  }

  function stopPolling() {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (pollingTimeout) { clearTimeout(pollingTimeout); pollingTimeout = null; }
  }

  function resetButtons() {
    const buttons = [elements.complete, elements.stickyBtn].filter(Boolean);
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || "Confirm & Proceed to Payment";
    });
  }

  function startPaymentPolling(checkoutId) {
    currentCheckoutId = checkoutId;
    stopPolling(); // Clear any previous polling

    // Timeout after 5 minutes
    pollingTimeout = setTimeout(() => {
      stopPolling();
      showTimeoutUI();
    }, 5 * 60 * 1000);

    pollingInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sumup?action=getCheckoutStatus&checkout_id=${checkoutId}`);
        if (!res.ok) { console.warn("Polling: Non-OK response", res.status); return; }
        const data = await res.json();

        console.log("Polling status:", data.status);

        if (data.status === "PAID") {
          stopPolling();

          // CRITICAL: Call fallback endpoint and only show success after booking is confirmed
          try {
            console.log("Polling: Payment confirmed. Finalizing booking...");
            const overlayMessage = getOverlay()?.querySelector(".po-message");
            if (overlayMessage) overlayMessage.textContent = "Finalizing booking...";

            const bookingRes = await fetch("/api/create-booking-from-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ checkout_id: checkoutId })
            });
            const bookingResult = await bookingRes.json();
            console.log("Polling: Fallback booking result:", JSON.stringify(bookingResult));

            if (bookingRes.ok && bookingResult.booking_created === true) {
              localStorage.removeItem("pending_booking_data");
              const currentTour = getTour(current.tour) || tour;
              showSuccessUI(currentTour.title);
            } else {
              showErrorUI("Payment received, but booking is still processing. Please wait a moment and refresh this page.");
            }
          } catch (bookingErr) {
            console.error("Polling: Fallback booking call failed:", bookingErr);
            showErrorUI("Payment received, but we could not finalize your booking due to a temporary network issue. Please refresh in a moment.");
          }
        }

        if (data.status === "FAILED" || data.status === "EXPIRED") {
          stopPolling();
          showErrorUI(`Payment ${data.status.toLowerCase()}. Please try again.`);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);
  }

  // ── Main Payment Handler ──────────────────────────────────────────────────
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
      const checkoutData = {
        amount: total,
        currency: "DKK",
        checkout_reference: `RESERVE-${Date.now()}-${name.substring(0, 3).toUpperCase()}`,
        return_url: "https://botes-web.vercel.app/reserve/success.html",
        description: `Seaduced Experience: ${currentTour.title}`,
        metadata: {
          name: String(name),
          email: String(email),
          phone: String(phone),
          tour: String(currentTour.title),
          tourTitle: String(currentTour.title),
          calendar: String(currentTour.calendar || "boat1"),
          date: String(current.date),
          time: String(current.time),
          qty: String(current.qty),
          lang: String(current.lang),
          tapas: String(current.tapas || 0),
          extras: String(current.tapas || 0),
          total: String(total)
        }
      };

      const response = await fetch("/api/sumup?action=createCheckout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutData)
      });

      const checkout = await response.json();

      if (response.ok && checkout.hosted_checkout_url) {
        // Store booking data as backup
        localStorage.setItem("pending_booking_data", JSON.stringify(checkoutData.metadata));

        // Open SumUp in a NEW TAB — user stays here
        window.open(checkout.hosted_checkout_url, "_blank");

        // Show waiting overlay + start polling
        showPaymentWaitingUI();
        startPaymentPolling(checkout.id);
      } else {
        console.error("SumUp Proxy Error:", checkout);
        throw new Error(checkout.error || checkout.message || "Failed to create checkout session");
      }

    } catch (error) {
      console.error("Payment initiation error:", error);
      window.alert("Apologies, we encountered an issue initiating your payment. Please try again or contact us directly via WhatsApp.");
      resetButtons();
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
