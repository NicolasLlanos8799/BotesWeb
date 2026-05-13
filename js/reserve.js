import {
  EXTRA_CHARCUTERIE,
  formatCurrency,
  getBooking,
  getTour,
  readBookingFromUrl,
  saveBooking,
  clearBookingSelection,
  TOURS,
  getLocalizedValue,
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

  const isSpanishUI = window.location.pathname.startsWith('/es/') || window.location.pathname === '/es/reserve' || window.location.pathname === '/es';
  console.log("Reserve Page: isSpanishUI =", isSpanishUI, "Path =", window.location.pathname);

  let current = saveBooking({
    tour: tour.id,
    qty: booking.qty || 1,
    tapas: booking.tapas || 0,
    date: booking.date || "",
    time: booking.time || "",
    lang: booking.lang || (isSpanishUI ? "spanish" : "english"),
  });

  if (elements.name) elements.name.value = current.contact?.name || "";
  if (elements.email) elements.email.value = current.contact?.email || "";

  function render() {
    const currentTour = getTour(current.tour) || tour;
    const tapasTotal = current.tapas * EXTRA_CHARCUTERIE.price;
    const total = currentTour.price + tapasTotal;

    if (elements.tourImg) {
      elements.tourImg.src = currentTour.img;
      elements.tourImg.alt = getLocalizedValue(currentTour, "title", isSpanishUI ? "spanish" : "english");
      elements.tourImg.onload = () => { elements.tourImg.style.opacity = "1"; };
    }
    if (elements.tourDisplay) elements.tourDisplay.textContent = getLocalizedValue(currentTour, "title", isSpanishUI ? "spanish" : "english");
    if (elements.tourTitle) elements.tourTitle.textContent = getLocalizedValue(currentTour, "title", isSpanishUI ? "spanish" : "english");
    if (elements.tourDuration) elements.tourDuration.textContent = getLocalizedValue(currentTour, "duration", isSpanishUI ? "spanish" : "english");
    if (elements.summaryTourName) elements.summaryTourName.textContent = getLocalizedValue(currentTour, "title", isSpanishUI ? "spanish" : "english");
    if (elements.summaryTourPrice) elements.summaryTourPrice.textContent = formatCurrency(currentTour.price);
    if (elements.tapasQty) elements.tapasQty.textContent = String(current.tapas);

    const formattedTotal = formatCurrency(total);
    if (elements.summaryTotal) elements.summaryTotal.textContent = formattedTotal;
    if (elements.stickyTotal) elements.stickyTotal.textContent = formattedTotal;

    if (elements.scheduleDisplay) {
      if (current.date && current.time) {
        const dateObj = new Date(current.date + "T00:00:00");
        const dateStr = new Intl.DateTimeFormat(isSpanishUI ? "es-ES" : "en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(dateObj);
        const startsAt = isSpanishUI ? "comienza a las" : "starts at";
        elements.scheduleDisplay.textContent = `${dateStr}, ${startsAt} ${current.time}`;
      } else if (current.date) {
        const dateObj = new Date(current.date + "T00:00:00");
        const dateStr = new Intl.DateTimeFormat(isSpanishUI ? "es-ES" : "en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        }).format(dateObj);
        elements.scheduleDisplay.textContent = dateStr;
      } else {
        elements.scheduleDisplay.textContent = isSpanishUI ? "Selecciona fecha y hora" : "Select a date & time";
      }
    }
    if (elements.peopleDisplay) {
      elements.peopleDisplay.textContent = String(current.qty || 1);
    }
    if (elements.peopleLabel) {
      const isOne = (current.qty || 1) === 1;
      if (isSpanishUI) {
        elements.peopleLabel.textContent = isOne ? "persona" : "personas";
      } else {
        elements.peopleLabel.textContent = isOne ? "person" : "people";
      }
    }
    if (elements.peopleMinus) {
      elements.peopleMinus.disabled = (current.qty || 1) <= 1;
    }
    if (elements.peoplePlus) {
      elements.peoplePlus.disabled = (current.qty || 1) >= 8;
    }
    if (elements.langDisplay) {
      const langMap = {
        spanish: isSpanishUI ? "Español" : "Spanish",
        danish: isSpanishUI ? "Danés" : "Danish",
        english: isSpanishUI ? "Inglés" : "English"
      };
      elements.langDisplay.textContent = langMap[current.lang] || langMap.english;
    }

    if (current.tapas > 0) {
      elements.summaryExtra.style.display = "flex";
      const extraTitle = getLocalizedValue(EXTRA_CHARCUTERIE, "title", isSpanishUI ? "spanish" : "english");
      elements.summaryExtra.innerHTML = `<span>${extraTitle} (x${current.tapas})</span><span>${formatCurrency(tapasTotal)}</span>`;
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

    const isEs = current.lang === "spanish";
    if (icon) icon.innerHTML = `<div class="po-spinner"></div>`;
    if (title) title.textContent = isEs ? "Completa tu pago" : "Complete your payment";
    if (message) message.textContent = isEs 
      ? "Se ha abierto una nueva pestaña con la página de pago seguro de SumUp. Por favor, completa tu pago allí."
      : "A new tab has been opened with the secure SumUp payment page. Please complete your payment there.";
    if (hint) { 
      hint.style.display = "block"; 
      hint.textContent = isEs 
        ? "Confirmaremos tu reserva automáticamente una vez recibido el pago."
        : "We'll automatically confirm your booking once payment is received."; 
    }
    if (actions) actions.innerHTML = `<button class="po-btn po-btn--secondary" id="po-cancel-btn">${isEs ? "Cancelar Pago" : "Cancel Payment"}</button>`;
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

    const isEs = current.lang === "spanish";
    if (card) card.classList.add("po-card--success");
    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg class="po-checkmark" viewBox="0 0 52 52">
        <circle class="po-checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
        <path class="po-checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
      </svg>`;
    if (title) title.textContent = isEs ? "¡Pago Confirmado!" : "Payment Confirmed!";
    if (message) {
      if (isEs) {
        message.innerHTML = tourTitle
          ? `Tu reserva para <strong>"${tourTitle}"</strong> ha sido creada con éxito.`
          : "Tu reserva ha sido creada con éxito.";
      } else {
        message.innerHTML = tourTitle
          ? `Your booking for <strong>"${tourTitle}"</strong> has been successfully created.`
          : "Your booking has been successfully created.";
      }
    }
    if (hint) { 
      hint.style.display = "block"; 
      hint.textContent = isEs
        ? "Se ha enviado un correo de confirmación con una invitación de calendario a tu bandeja de entrada."
        : "A confirmation email with a calendar invite has been sent to your inbox."; 
    }
    if (actions) actions.innerHTML = `<a href="/" class="po-btn po-btn--primary">${isEs ? "Volver al Inicio" : "Return to Homepage"}</a>`;
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

    const isEs = current.lang === "spanish";
    if (card) card.classList.add("po-card--error");
    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#c62828" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
    if (title) title.textContent = isEs ? "Problema con el Pago" : "Payment Issue";
    if (message) {
      if (isEs) {
        message.textContent = errorMessage || "No se pudo procesar tu pago. Por favor, inténtalo de nuevo.";
      } else {
        message.textContent = errorMessage || "Your payment could not be processed. Please try again.";
      }
    }
    if (hint) hint.style.display = "none";
    if (actions) actions.innerHTML = `
      <button class="po-btn po-btn--primary" id="po-retry-btn">${isEs ? "Intentar de nuevo" : "Try Again"}</button>
      <a href="/" class="po-btn po-btn--secondary">${isEs ? "Volver al Inicio" : "Return to Homepage"}</a>`;

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

    const isEs = current.lang === "spanish";
    if (progress) progress.style.display = "none";
    if (icon) icon.innerHTML = `
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#f57c00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>`;
    if (title) title.textContent = isEs ? "Está tardando más de lo esperado" : "Taking longer than expected";
    if (message) message.textContent = isEs
      ? "Aún no hemos recibido la confirmación del pago. Si ya completaste el pago, por favor espera un momento o contáctanos."
      : "We haven't received payment confirmation yet. If you completed the payment, please wait a moment or contact us.";
    if (hint) { 
      hint.style.display = "block"; 
      hint.textContent = isEs
        ? "Si la pestaña de pago sigue abierta, por favor complétalo allí."
        : "If the payment tab is still open, please complete it there."; 
    }
    if (actions) actions.innerHTML = `
      <button class="po-btn po-btn--primary" id="po-resume-btn">${isEs ? "Seguir esperando" : "Keep Waiting"}</button>
      <a href="/" class="po-btn po-btn--secondary">${isEs ? "Volver al Inicio" : "Return to Homepage"}</a>`;

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
    const isEs = current.lang === "spanish";
    const buttons = [elements.complete, elements.stickyBtn].filter(Boolean);
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || (isEs ? "Confirmar y Proceder al Pago" : "Confirm & Proceed to Payment");
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

          // CRITICAL: Call fallback endpoint to ensure booking exists
          // This is idempotent — GAS deduplicates via sumup_checkout_id
          try {
            console.log("Polling: Payment confirmed. Ensuring booking exists...");
            
            // Recuperar metadatos guardados localmente para pasarlos como backup
            const savedMetadataRaw = localStorage.getItem("pending_booking_data");
            const savedMetadata = savedMetadataRaw ? JSON.parse(savedMetadataRaw) : null;

            const bookingRes = await fetch("/api/create-booking-from-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                checkout_id: checkoutId,
                metadata: savedMetadata // Enviamos la info como respaldo
              })
            });
            const bookingResult = await bookingRes.json();
            console.log("Polling: Fallback booking result:", JSON.stringify(bookingResult));
          } catch (bookingErr) {
            // Even if fallback fails, webhook may have already handled it
            console.error("Polling: Fallback booking call failed:", bookingErr);
          }

          localStorage.removeItem("pending_booking_data");
          const currentTour = getTour(current.tour) || tour;
          showSuccessUI(getLocalizedValue(currentTour, "title", current.lang));
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

    const isEs = current.lang === "spanish";
    if (!name || !email || !phone) {
      window.alert(isEs 
        ? "Por favor, completa todos los datos de contacto (Nombre, Correo y Teléfono) antes de continuar."
        : "Please fill in all contact details (Name, Email, and Phone) before continuing.");
      return;
    }

    const buttons = [elements.complete, elements.stickyBtn].filter(Boolean);
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = isEs ? "Iniciando Pago..." : "Initiating Payment...";
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
        description: `Seaduced Experience: ${getLocalizedValue(currentTour, "title", current.lang)}`,
        metadata: {
          name: String(name),
          email: String(email),
          phone: String(phone),
          tour: String(getLocalizedValue(currentTour, "title", current.lang)),
          tourTitle: String(getLocalizedValue(currentTour, "title", current.lang)),
          calendar: String(currentTour.calendar || "boat1"),
          date: String(current.date),
          time: String(current.time),
          qty: String(current.qty),
          lang: String(current.lang),
          tapas: String(tapasTotal > 0 ? (tapasTotal / 350) : "0"),
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
      window.alert(isEs
        ? "Disculpa, encontramos un problema al iniciar tu pago. Por favor, inténtalo de nuevo o contáctanos directamente por WhatsApp."
        : "Apologies, we encountered an issue initiating your payment. Please try again or contact us directly via WhatsApp.");
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
