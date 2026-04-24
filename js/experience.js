import { getBooking, navigateToReserve, saveBooking, clearBookingSelection, TOURS, getPersistentCache, savePersistentCache } from "./utils.js";

const GAS_URL = "/api/proxy";

const DEFAULT_SLOTS = [
  { time: "09:00", available: true },
  { time: "10:00", available: true },
  { time: "11:00", available: true },
  { time: "12:00", available: true },
  { time: "13:00", available: true },
  { time: "14:00", available: true },
  { time: "15:00", available: true },
  { time: "16:00", available: true }
];

export function initExperiencePage() {
  initAccordion();
  initBookingPanel();
  initStickyCta();
  initGalleryDots();
}

function initAccordion() {
  const items = document.querySelectorAll('.experience-tab-panel');

  items.forEach(item => {
    const header = item.querySelector('.accordion-trigger');
    const content = item.querySelector('.accordion-content');
    if (!header || !content) return;

    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');

      // 1. Close ALL items
      items.forEach(i => {
        i.classList.remove('active');
        const c = i.querySelector('.accordion-content');
        if (c) {
          // Force reflow for smooth transition from 'auto' to '0px'
          if (c.style.height === 'auto' || c.style.height === '') {
            c.style.height = c.scrollHeight + 'px';
            c.offsetHeight; // force reflow
          }
          c.style.height = '0px';
        }
        i.querySelector('.accordion-trigger')?.setAttribute('aria-expanded', 'false');
      });

      // 2. Open clicked item (if it was closed)
      if (!isOpen) {
        item.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
        content.style.height = content.scrollHeight + 'px';

        // Fix height after animation
        content.addEventListener('transitionend', () => {
          if (item.classList.contains('active')) {
            content.style.height = 'auto';
          }
        }, { once: true });

        // Smooth scroll to item (Sync with end of height transition for stability)
        setTimeout(() => {
          if (!item.classList.contains('active')) return;

          const yOffset = -100;
          const rect = item.getBoundingClientRect();
          const y = rect.top + window.pageYOffset + yOffset;

          window.scrollTo({
            top: y,
            behavior: 'smooth'
          });
        }, 350);
      }
    });
  });

  // 3. Set Initial State (First item open)
  const firstPanel = items[0];
  if (firstPanel) {
    const firstContent = firstPanel.querySelector('.accordion-content');
    const firstTrigger = firstPanel.querySelector('.accordion-trigger');
    firstPanel.classList.add('active');
    if (firstContent) firstContent.style.height = 'auto';
    if (firstTrigger) firstTrigger.setAttribute('aria-expanded', 'true');
  }
}

function initBookingPanel() {
  // Aggressive reset on entry to ensure fresh selection
  clearBookingSelection();

  const booking = getBooking();
  const peoplePicker = document.getElementById("experience-people-picker");
  const peopleTrigger = document.getElementById("experience-people-trigger");
  const peoplePanel = document.getElementById("experience-people-panel");
  const peopleValueInput = document.getElementById("experience-participants");
  const peopleValueLabel = document.getElementById("experience-people-value");
  const peopleValueNumber = document.getElementById("experience-people-number");
  const peopleMinus = document.getElementById("experience-people-minus");
  const peoplePlus = document.getElementById("experience-people-plus");
  const peopleDone = document.getElementById("experience-people-done");

  const datePicker = document.getElementById("experience-date-picker");
  const dateTrigger = document.getElementById("experience-date-trigger");
  const datePanel = document.getElementById("experience-date-panel");
  const dateValueInput = document.getElementById("experience-date");
  const dateValueLabel = document.getElementById("experience-date-value");
  const dateGrid = document.getElementById("experience-date-grid");
  const dateMonthLabel = document.getElementById("experience-date-month");
  const datePrev = document.getElementById("experience-date-prev");
  const dateNext = document.getElementById("experience-date-next");
  const dateDone = document.getElementById("experience-date-done");

  const languagePicker = document.getElementById("experience-language-picker");
  const languageTrigger = document.getElementById("experience-language-trigger");
  const languagePanel = document.getElementById("experience-language-panel");
  const languageValueInput = document.getElementById("experience-language");
  const languageValueLabel = document.getElementById("experience-language-value");
  const languageDone = document.getElementById("experience-language-done");
  const languageOptions = Array.from(document.querySelectorAll("[data-language-option]"));

  const timePicker = document.getElementById("experience-time-picker");
  const timeTrigger = document.getElementById("experience-time-trigger");
  const timePanel = document.getElementById("experience-time-panel");
  const timeValueInput = document.getElementById("experience-time");
  const timeValueLabel = document.getElementById("experience-time-value");
  const timeGrid = document.getElementById("experience-time-grid");
  const timeDone = document.getElementById("experience-time-done");

  const availabilityButton = document.getElementById("experience-check-availability");

  if (!peopleValueInput || !dateValueInput || !languageValueInput || !availabilityButton) {
    return;
  }

  if (booking.qty) {
    peopleValueInput.value = String(booking.qty);
  }
  if (booking.date) {
    dateValueInput.value = booking.date;
  }
  if (booking.time) {
    timeValueInput.value = booking.time;
  }
  if (booking.lang) {
    languageValueInput.value = booking.lang;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateStart = new Date(today);
  dateStart.setDate(dateStart.getDate() + 1);

  const dateEnd = new Date(today);
  dateEnd.setDate(dateEnd.getDate() + 90);

  let visibleMonth = new Date(dateStart.getFullYear(), dateStart.getMonth(), 1);

  function syncStoredBooking() {
    const tourId = document.body.dataset.experienceId || "book-1h";
    saveBooking({
      tour: tourId,
      qty: Number.parseInt(peopleValueInput.value, 10) || 1,
      date: dateValueInput.value,
      time: timeValueInput.value,
      lang: languageValueInput.value,
    });
  }

  function syncPeopleValue(nextValue) {
    const tourId = document.body.dataset.experienceId || "book-1h";
    const tourConfig = TOURS[tourId] || {};
    const maxPeople = tourConfig.maxParticipants || 8;
    
    const safeValue = Math.max(1, Math.min(maxPeople, nextValue));
    peopleValueInput.value = String(safeValue);
    peopleValueLabel.textContent = String(safeValue);
    peopleValueNumber.textContent = String(safeValue);
    peopleMinus.disabled = safeValue <= 1;
    peoplePlus.disabled = safeValue >= maxPeople;
    syncStoredBooking();
  }

  function formatDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(date) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function syncDateValue(date) {
    dateValueInput.value = formatDateValue(date);
    dateValueLabel.textContent = formatDateLabel(date);

    // Reset time when date changes
    timeValueInput.value = "";

    const dateStr = formatDateValue(date);
    const tourId = document.body.dataset.experienceId || "book-1h";
    const tourConfig = TOURS[tourId] || {};
    const calId = tourConfig.calendar || "boat1";

    // ELITE SYNC LOGIC: Prioritize verified persistent data
    const yearMonth = dateStr.substring(0, 7);
    
    // Check global persistent cache again (in case background sync finished)
    const pCache = getPersistentCache(calId);
    if (!availabilityCache[calId]) availabilityCache[calId] = pCache;
    else Object.assign(availabilityCache[calId], pCache);

    const dayData = availabilityCache[calId][dateStr];

    if (dayData) {
      // INSTANT: We have verified data
      renderTimeSlots(dayData, false);
      enableTimeSelector();
    } else {
      // WAIT FOR VERIFIED: We don't enable the selector until we have real data
      // This prevents the "not synchronized" feeling
      timeTrigger.disabled = true;
      timeTrigger.setAttribute('disabled', 'true');
      timeValueLabel.textContent = "Syncing...";

      const syncHandler = () => {
        const freshCache = getPersistentCache(calId);
        if (freshCache[dateStr]) {
          renderTimeSlots(freshCache[dateStr], false);
          enableTimeSelector();
          return true;
        }
        return false;
      };

      if (syncPromises[yearMonth]) {
        syncPromises[yearMonth].then(() => {
          if (!syncHandler()) fetchAvailability(dateStr).then(syncHandler);
        });
      } else {
        fetchAvailability(dateStr).then(syncHandler);
      }
    }

    syncStoredBooking();
  }

  function enableTimeSelector() {
    timeTrigger.disabled = false;
    timeTrigger.removeAttribute('disabled');
    timeValueLabel.textContent = "Choose time";
  }

  function syncTimeValue(timeString) {
    timeValueInput.value = timeString;
    timeValueLabel.textContent = timeString;
    syncStoredBooking();

    // Re-render time grid to show selected
    const slots = Array.from(timeGrid.querySelectorAll(".experience-booking__time-slot"));
    slots.forEach(slot => {
      slot.classList.toggle("is-selected", slot.dataset.time === timeString);
    });
  }

  // Global-level cache for total persistence and proactive sync
  let lastAvailabilityRequestId = 0;
  let availabilityCache = {}; // Structured by calendarId: { "YYYY-MM-DD": [...], ... }
  let syncPromises = {}; // Tracks ongoing monthly syncs to avoid redundant requests

  function handleApiResponse(data, dateContext) {
    const tourId = document.body.dataset.experienceId || "book-1h";
    const calId = TOURS[tourId]?.calendar || "boat1";
    
    // 1. Handle monthly map { "YYYY-MM-DD": [...], ... }
    if (data && !Array.isArray(data) && typeof data === 'object') {

      const selectedDate = dateValueInput.value;
      if (selectedDate && availabilityCache[selectedDate]) {
        renderTimeSlots(availabilityCache[selectedDate], false);
        timeTrigger.disabled = false;
        if (!timeValueInput.value) {
          timeValueLabel.textContent = "Choose time";
        }
      }
    }
    // 2. Handle individual day array [...]
    else if (Array.isArray(data)) {
      const selectedDate = dateValueInput.value;
      // Only apply to UI if it matches the current date context
      if (selectedDate === dateContext) {
        renderTimeSlots(data, false);
        timeTrigger.disabled = false;
        if (!timeValueInput.value) {
          timeValueLabel.textContent = "Choose time";
        }
        // Cache it for future use
        availabilityCache[dateContext] = data;
      }
    }
  }

  async function fetchMonthlyAvailability(dateStr) {
    const yearMonth = dateStr.substring(0, 7);
    if (syncPromises[yearMonth]) return syncPromises[yearMonth];

    syncPromises[yearMonth] = (async () => {
      try {
        const tourId = document.body.dataset.experienceId || "book-1h";
        const tourConfig = TOURS[tourId] || {};
        const cal = tourConfig.calendar || "boat1";
        
        const response = await fetch(`${GAS_URL}?action=getMonthlyAvailability&date=${dateStr}&calendar=${cal}&t=${Date.now()}`);
        if (!response.ok) throw new Error("Network issue");
        const data = await response.json();
        
        // Populate and persist cache
        if (data && typeof data === 'object') {
          savePersistentCache(cal, data);
          if (!availabilityCache[cal]) availabilityCache[cal] = {};
          Object.assign(availabilityCache[cal], data);
        }
        
        return data;
      } catch (error) {
        console.warn(`Monthly sync failed for ${yearMonth}:`, error);
        delete syncPromises[yearMonth];
      }
    })();

    return syncPromises[yearMonth];
  }

  async function fetchAvailability(date) {
    // SILENT SYNC: We don't show the "Syncing" text anymore. 
    // If not in cache, we just render current slots quietly.

    const requestId = ++lastAvailabilityRequestId;

    try {
      const tourId = document.body.dataset.experienceId || "book-1h";
      const tourConfig = TOURS[tourId] || {};
      const cal = tourConfig.calendar || "boat1";

      const response = await fetch(`${GAS_URL}?action=getAvailability&date=${date}&calendar=${cal}&t=${Date.now()}`);
      if (!response.ok) throw new Error("Sync failed");
      const data = await response.json();

      // Safety: Ignore if a newer request has started
      if (requestId !== lastAvailabilityRequestId) return;

      handleApiResponse(data, date);
    } catch (error) {
      if (requestId !== lastAvailabilityRequestId) return;
      console.warn("Daily availability fetch failed:", error);
      timeTrigger.disabled = false;
      if (!timeValueInput.value) {
        timeValueLabel.textContent = "Choose time";
      }
      renderTimeSlots(DEFAULT_SLOTS, false);
    }
  }

  function renderTimeSlots(slots, isLoading) {
    timeGrid.innerHTML = "";

    const today = new Date();
    const isToday = dateValueInput.value === formatDateValue(today);
    const now = today.getHours() * 60 + today.getMinutes();

    if (isLoading) {
      // We removed the "Syncing with calendar..." text to make it feel instant.
      // The slots will simply update in the background.
    }

    slots.forEach(slot => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "experience-booking__time-slot";

      // If today, and slot time is within 1 hour from now, make it unavailable
      let slotAvailable = slot.available;
      if (isToday && !isLoading) {
        const [h, m] = slot.time.split(':').map(Number);
        const slotTime = h * 60 + m;
        if (slotTime < now + 60) {
          slotAvailable = false;
        }
      }

      if (isLoading) btn.classList.add("is-loading");
      if (timeValueInput.value === slot.time) btn.classList.add("is-selected");
      if (!slotAvailable && !isLoading) btn.disabled = true;
      btn.textContent = slot.time;
      btn.dataset.time = slot.time;

      btn.addEventListener("click", () => {
        syncTimeValue(slot.time);
        if (window.innerWidth > 768) {
          togglePanel(timePicker, timePanel, timeTrigger, false);
        }
      });

      timeGrid.appendChild(btn);
    });
  }

  function syncLanguageValue(nextValue) {
    const allowedLangs = ["english", "spanish", "danish"];
    const safeValue = allowedLangs.includes(nextValue) ? nextValue : "english";

    languageValueInput.value = safeValue;

    // Capitalize first letter for label
    const label = safeValue.charAt(0).toUpperCase() + safeValue.slice(1);
    languageValueLabel.textContent = label;
    languageOptions.forEach((option) => {
      const isSelected = option.getAttribute("data-language-option") === safeValue;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
    syncStoredBooking();
  }

  function togglePanel(wrapper, panel, trigger, isOpen) {
    if (!wrapper || !panel || !trigger) return;
    if (isOpen) {
      panel.hidden = false;
      requestAnimationFrame(() => {
        wrapper.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      });
      return;
    }

    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!wrapper.classList.contains("is-open")) {
        panel.hidden = true;
      }
    }, 180);
  }

  function isDateAvailable(date) {
    const weekday = date.getDay();
    return date >= dateStart && date <= dateEnd && weekday !== 1;
  }

  function renderCalendar() {
    dateMonthLabel.textContent = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(visibleMonth);

    dateGrid.innerHTML = "";
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell += 1) {
      const dayButton = document.createElement("button");
      dayButton.type = "button";
      dayButton.className = "experience-booking__calendar-day";

      const dayNumber = cell - offset + 1;
      if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
        dayButton.classList.add("is-empty");
        dayButton.disabled = true;
        dateGrid.appendChild(dayButton);
        continue;
      }

      const currentDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber);
      const available = isDateAvailable(currentDate);
      const selected = dateValueInput.value === formatDateValue(currentDate);

      dayButton.textContent = String(dayNumber);

      if (!available) {
        dayButton.disabled = true;
        dayButton.classList.add("is-unavailable");
      } else {
        dayButton.classList.add("is-available");

        // --- PRE-FETCH ON HOVER ---
        // Anticipate the click: start syncing the moment the user hovers the day
        dayButton.addEventListener("mouseenter", () => {
          const dateStr = formatDateValue(currentDate);
          const tourId = document.body.dataset.experienceId || "book-1h";
          const calId = TOURS[tourId]?.calendar || "boat1";
          
          if (!availabilityCache[calId]?.[dateStr]) {
            fetchAvailability(dateStr);
          }
        });

        dayButton.addEventListener("click", () => {
          syncDateValue(currentDate);
          renderCalendar();
          if (window.innerWidth > 768) {
            togglePanel(datePicker, datePanel, dateTrigger, false);
          }
        });
      }

      if (selected) {
        dayButton.classList.add("is-selected");
      }

      dateGrid.appendChild(dayButton);
    }

    // TRIGGER MONTHLY SYNC: Quietly download the map for this visible month
    if (visibleMonth) {
      fetchMonthlyAvailability(formatDateValue(visibleMonth));
    }

    datePrev.disabled = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0) < dateStart;
    dateNext.disabled = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1) > dateEnd;
  }

  if (dateValueInput.value) {
    const savedDate = new Date(`${dateValueInput.value}T00:00:00`);
    if (!Number.isNaN(savedDate.getTime())) {
      visibleMonth = new Date(savedDate.getFullYear(), savedDate.getMonth(), 1);
      dateValueLabel.textContent = formatDateLabel(savedDate);
      timeTrigger.disabled = false;
      timeTrigger.removeAttribute('disabled');
      if (booking.time) {
        timeValueLabel.textContent = booking.time;
      }
      // Force immediate render of slots to remove placeholder
      const dateStr = dateValueInput.value;
      const initialSlots = availabilityCache[dateStr] || DEFAULT_SLOTS;
      renderTimeSlots(initialSlots, false);
      fetchAvailability(dateStr);
    }
  }

  syncPeopleValue(Number.parseInt(peopleValueInput.value, 10) || 1);
  syncLanguageValue(languageValueInput.value);
  // 1. Initial Render
  renderCalendar();

  // 2. AGGRESSIVE PROACTIVE SYNC: Fetch 3 months of data immediately
  const baseDate = new Date();
  const monthsToSync = [0, 1, 2];
  monthsToSync.forEach(offset => {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
    fetchMonthlyAvailability(formatDateValue(d));
  });

  peopleTrigger?.addEventListener("click", () => {
    togglePanel(
      peoplePicker,
      peoplePanel,
      peopleTrigger,
      !peoplePicker.classList.contains("is-open")
    );
  });
  peopleMinus?.addEventListener("click", () => syncPeopleValue((Number.parseInt(peopleValueInput.value, 10) || 1) - 1));
  peoplePlus?.addEventListener("click", () => syncPeopleValue((Number.parseInt(peopleValueInput.value, 10) || 1) + 1));
  peopleDone?.addEventListener("click", () => togglePanel(peoplePicker, peoplePanel, peopleTrigger, false));

  dateTrigger?.addEventListener("click", () => {
    togglePanel(datePicker, datePanel, dateTrigger, !datePicker.classList.contains("is-open"));
  });
  datePrev?.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  dateNext?.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  dateDone?.addEventListener("click", () => togglePanel(datePicker, datePanel, dateTrigger, false));

  languageTrigger?.addEventListener("click", () => {
    togglePanel(
      languagePicker,
      languagePanel,
      languageTrigger,
      !languagePicker.classList.contains("is-open")
    );
  });
  languageOptions.forEach((option) => {
    option.addEventListener("click", () => {
      syncLanguageValue(option.getAttribute("data-language-option"));
      if (window.innerWidth > 768) {
        togglePanel(languagePicker, languagePanel, languageTrigger, false);
      }
    });
  });
  languageDone?.addEventListener("click", () => togglePanel(languagePicker, languagePanel, languageTrigger, false));

  timeTrigger?.addEventListener("click", () => {
    if (timeTrigger.disabled) return;
    togglePanel(timePicker, timePanel, timeTrigger, !timePicker.classList.contains("is-open"));
  });
  timeDone?.addEventListener("click", () => togglePanel(timePicker, timePanel, timeTrigger, false));

  document.addEventListener("click", (event) => {
    if (!peoplePicker?.contains(event.target)) togglePanel(peoplePicker, peoplePanel, peopleTrigger, false);
    if (!datePicker?.contains(event.target)) togglePanel(datePicker, datePanel, dateTrigger, false);
    if (!timePicker?.contains(event.target)) togglePanel(timePicker, timePanel, timeTrigger, false);
    if (!languagePicker?.contains(event.target)) togglePanel(languagePicker, languagePanel, languageTrigger, false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    togglePanel(peoplePicker, peoplePanel, peopleTrigger, false);
    togglePanel(datePicker, datePanel, dateTrigger, false);
    togglePanel(timePicker, timePanel, timeTrigger, false);
    togglePanel(languagePicker, languagePanel, languageTrigger, false);
  });

  availabilityButton.addEventListener("click", () => {
    if (!dateValueInput.value || !timeValueInput.value) {
      alert("Please select both a date and a time.");
      if (!dateValueInput.value) dateTrigger.focus();
      else timeTrigger.focus();
      return;
    }

    const tourId = document.body.dataset.experienceId || "book-1h";
    navigateToReserve(tourId, {
      qty: Number.parseInt(peopleValueInput.value, 10) || 1,
      date: dateValueInput.value,
      time: timeValueInput.value,
      lang: languageValueInput.value,
    });
  });
}

function initStickyCta() {
  const stickyCta = document.querySelector(".mobile-sticky-cta");
  const stickyButton = document.getElementById("mobile-sticky-cta-button");
  const bookingCard = document.querySelector(".experience-booking");
  const availabilityButton = document.getElementById("experience-check-availability");

  stickyButton?.addEventListener("click", () => {
    availabilityButton?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  if (!stickyCta || !bookingCard || !("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          stickyCta.style.transform = "translateY(100%)";
          stickyCta.style.opacity = "0";
          stickyCta.style.pointerEvents = "none";
        } else {
          stickyCta.style.transform = "translateY(0)";
          stickyCta.style.opacity = "1";
          stickyCta.style.pointerEvents = "auto";
        }
      });
    },
    { threshold: 0.8 }
  );

  observer.observe(bookingCard);
}

function initGalleryDots() {
  const track = document.querySelector('.mobile-gallery__track');
  const dotsContainer = document.querySelector('.mobile-gallery__dots');
  if (!track || !dotsContainer) return;

  const slides = track.querySelectorAll('.mobile-gallery__slide');
  if (slides.length <= 1) return;

  // Create dots
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.classList.add('mobile-gallery__dot');
    if (i === 0) dot.classList.add('active');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);

    dot.addEventListener('click', () => {
      const slideWidth = slides[0].offsetWidth;
      const gap = 16;
      track.scrollTo({
        left: i * (slideWidth + gap),
        behavior: 'smooth'
      });
    });

    dotsContainer.appendChild(dot);
  });

  // Update active dot on scroll
  let isScrolling;
  track.addEventListener('scroll', () => {
    window.clearTimeout(isScrolling);
    isScrolling = setTimeout(() => {
      const slideWidth = slides[0].offsetWidth;
      const gap = 16;
      const index = Math.round(track.scrollLeft / (slideWidth + gap));

      const dots = dotsContainer.querySelectorAll('.mobile-gallery__dot');
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });
    }, 50);
  }, { passive: true });
}
