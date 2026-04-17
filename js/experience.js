import { getBooking, navigateToReserve, saveBooking } from "./utils.js";

export function initExperiencePage() {
  initTabs();
  initBookingPanel();
  initStickyCta();
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".experience-tab-btn");
  const tabPanels = document.querySelectorAll(".experience-tab-panel");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("aria-controls");

      tabButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      tabPanels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === targetId);
      });

      if (window.innerWidth < 768) {
        const nav = document.querySelector(".experience-tabs-nav");
        if (nav) {
          const top = nav.getBoundingClientRect().top + window.pageYOffset - 90;
          window.scrollTo({ top, behavior: "smooth" });
        }
      }
    });
  });
}

function initBookingPanel() {
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
    saveBooking({
      tour: "book-1h",
      qty: Number.parseInt(peopleValueInput.value, 10) || 1,
      date: dateValueInput.value,
      lang: languageValueInput.value,
    });
  }

  function syncPeopleValue(nextValue) {
    const safeValue = Math.max(1, Math.min(8, nextValue));
    peopleValueInput.value = String(safeValue);
    peopleValueLabel.textContent = String(safeValue);
    peopleValueNumber.textContent = String(safeValue);
    peopleMinus.disabled = safeValue <= 1;
    peoplePlus.disabled = safeValue >= 8;
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
    syncStoredBooking();
  }

  function syncLanguageValue(nextValue) {
    const safeValue = nextValue === "spanish" ? "spanish" : "english";
    languageValueInput.value = safeValue;
    languageValueLabel.textContent = safeValue === "spanish" ? "Spanish" : "English";
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

    datePrev.disabled = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0) < dateStart;
    dateNext.disabled = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1) > dateEnd;
  }

  if (dateValueInput.value) {
    const savedDate = new Date(`${dateValueInput.value}T00:00:00`);
    if (!Number.isNaN(savedDate.getTime())) {
      visibleMonth = new Date(savedDate.getFullYear(), savedDate.getMonth(), 1);
      dateValueLabel.textContent = formatDateLabel(savedDate);
    }
  }

  syncPeopleValue(Number.parseInt(peopleValueInput.value, 10) || 1);
  syncLanguageValue(languageValueInput.value);
  renderCalendar();

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

  document.addEventListener("click", (event) => {
    if (!peoplePicker?.contains(event.target)) togglePanel(peoplePicker, peoplePanel, peopleTrigger, false);
    if (!datePicker?.contains(event.target)) togglePanel(datePicker, datePanel, dateTrigger, false);
    if (!languagePicker?.contains(event.target)) togglePanel(languagePicker, languagePanel, languageTrigger, false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    togglePanel(peoplePicker, peoplePanel, peopleTrigger, false);
    togglePanel(datePicker, datePanel, dateTrigger, false);
    togglePanel(languagePicker, languagePanel, languageTrigger, false);
  });

  availabilityButton.addEventListener("click", () => {
    navigateToReserve("book-1h", {
      qty: Number.parseInt(peopleValueInput.value, 10) || 1,
      date: dateValueInput.value,
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
    { threshold: 0.1 }
  );

  observer.observe(bookingCard);
}
