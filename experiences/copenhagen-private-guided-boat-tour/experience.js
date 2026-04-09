'use strict';

(function () {
  function goToReserve(tourId) {
    const participants = document.getElementById('experience-participants')?.value || '1';
    const date = document.getElementById('experience-date')?.value || '';
    const language = document.getElementById('experience-language')?.value || 'english';
    const params = new URLSearchParams({ tour: tourId, qty: participants, lang: language });
    if (date) params.set('date', date);
    window.location.href = `/booking/reserve/?${params.toString()}`;
  }

  window.goToReserve = goToReserve;

  document.getElementById('experience-check-availability')?.addEventListener('click', () => {
    goToReserve('book-1h');
  });

  const peoplePicker = document.getElementById('experience-people-picker');
  const peopleTrigger = document.getElementById('experience-people-trigger');
  const peoplePanel = document.getElementById('experience-people-panel');
  const peopleValueInput = document.getElementById('experience-participants');
  const peopleValueLabel = document.getElementById('experience-people-value');
  const peopleValueNumber = document.getElementById('experience-people-number');
  const peopleMinus = document.getElementById('experience-people-minus');
  const peoplePlus = document.getElementById('experience-people-plus');
  const peopleDone = document.getElementById('experience-people-done');

  const datePicker = document.getElementById('experience-date-picker');
  const dateTrigger = document.getElementById('experience-date-trigger');
  const datePanel = document.getElementById('experience-date-panel');
  const dateValueInput = document.getElementById('experience-date');
  const dateValueLabel = document.getElementById('experience-date-value');
  const dateGrid = document.getElementById('experience-date-grid');
  const dateMonthLabel = document.getElementById('experience-date-month');
  const datePrev = document.getElementById('experience-date-prev');
  const dateNext = document.getElementById('experience-date-next');
  const dateDone = document.getElementById('experience-date-done');

  const languagePicker = document.getElementById('experience-language-picker');
  const languageTrigger = document.getElementById('experience-language-trigger');
  const languagePanel = document.getElementById('experience-language-panel');
  const languageValueInput = document.getElementById('experience-language');
  const languageValueLabel = document.getElementById('experience-language-value');
  const languageDone = document.getElementById('experience-language-done');
  const languageOptions = Array.from(document.querySelectorAll('[data-language-option]'));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateStart = new Date(today);
  dateStart.setDate(dateStart.getDate() + 1);

  const dateEnd = new Date(today);
  dateEnd.setDate(dateEnd.getDate() + 90);

  let visibleMonth = new Date(dateStart.getFullYear(), dateStart.getMonth(), 1);

  function syncPeopleValue(nextValue) {
    const safeValue = Math.max(1, Math.min(8, nextValue));
    peopleValueInput.value = String(safeValue);
    peopleValueLabel.textContent = String(safeValue);
    peopleValueNumber.textContent = String(safeValue);
    peopleMinus.disabled = safeValue <= 1;
    peoplePlus.disabled = safeValue >= 8;
  }

  function openPeoplePanel() {
    peoplePanel.hidden = false;
    requestAnimationFrame(() => {
      peoplePicker.classList.add('is-open');
      peopleTrigger.setAttribute('aria-expanded', 'true');
    });
  }

  function closePeoplePanel() {
    peoplePicker.classList.remove('is-open');
    peopleTrigger.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!peoplePicker.classList.contains('is-open')) {
        peoplePanel.hidden = true;
      }
    }, 180);
  }

  function isDateAvailable(date) {
    const weekday = date.getDay();
    return date >= dateStart && date <= dateEnd && weekday !== 1;
  }

  function formatDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateLabel(date) {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  function syncDateValue(date) {
    const formattedValue = formatDateValue(date);
    dateValueInput.value = formattedValue;
    dateValueLabel.textContent = formatDateLabel(date);
  }

  function openDatePanel() {
    datePanel.hidden = false;
    requestAnimationFrame(() => {
      datePicker.classList.add('is-open');
      dateTrigger.setAttribute('aria-expanded', 'true');
    });
  }

  function closeDatePanel() {
    datePicker.classList.remove('is-open');
    dateTrigger.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!datePicker.classList.contains('is-open')) {
        datePanel.hidden = true;
      }
    }, 180);
  }

  function renderCalendar() {
    if (!dateGrid || !dateMonthLabel) return;

    dateMonthLabel.textContent = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(visibleMonth);

    dateGrid.innerHTML = '';
    dateGrid.classList.remove('is-rendering');
    void dateGrid.offsetWidth;
    dateGrid.classList.add('is-rendering');

    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const offset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;

    for (let cell = 0; cell < totalCells; cell++) {
      const dayButton = document.createElement('button');
      dayButton.type = 'button';
      dayButton.className = 'experience-booking__calendar-day';

      const dayNumber = cell - offset + 1;
      if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
        dayButton.classList.add('is-empty');
        dayButton.disabled = true;
        dateGrid.appendChild(dayButton);
        continue;
      }

      const currentDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), dayNumber);
      const available = isDateAvailable(currentDate);
      const isToday = currentDate.getTime() === today.getTime();
      const isSelected = dateValueInput.value === formatDateValue(currentDate);

      dayButton.textContent = String(dayNumber);
      dayButton.dataset.date = formatDateValue(currentDate);

      if (available) {
        dayButton.classList.add('is-available');
        dayButton.addEventListener('click', () => {
          syncDateValue(currentDate);
          renderCalendar();
          if (window.innerWidth > 768) closeDatePanel();
        });
      } else {
        dayButton.disabled = true;
        dayButton.classList.add('is-unavailable');
      }

      if (isToday) dayButton.classList.add('is-today');
      if (isSelected) dayButton.classList.add('is-selected');
      dateGrid.appendChild(dayButton);
    }

    const prevMonthLastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 0);
    datePrev.disabled = prevMonthLastDay < dateStart;
    const nextMonthFirstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    dateNext.disabled = nextMonthFirstDay > dateEnd;
  }

  function syncLanguageValue(nextValue) {
    const safeValue = nextValue === 'spanish' ? 'spanish' : 'english';
    const label = safeValue === 'spanish' ? 'Spanish' : 'English';
    languageValueInput.value = safeValue;
    languageValueLabel.textContent = label;
    languageOptions.forEach(option => {
      const isSelected = option.getAttribute('data-language-option') === safeValue;
      option.classList.toggle('is-selected', isSelected);
      option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
  }

  function openLanguagePanel() {
    languagePanel.hidden = false;
    requestAnimationFrame(() => {
      languagePicker.classList.add('is-open');
      languageTrigger.setAttribute('aria-expanded', 'true');
    });
  }

  function closeLanguagePanel() {
    languagePicker.classList.remove('is-open');
    languageTrigger.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!languagePicker.classList.contains('is-open')) {
        languagePanel.hidden = true;
      }
    }, 180);
  }

  peopleTrigger?.addEventListener('click', () => {
    if (peoplePicker.classList.contains('is-open')) {
      closePeoplePanel();
    } else {
      openPeoplePanel();
    }
  });

  peopleMinus?.addEventListener('click', () => {
    syncPeopleValue(parseInt(peopleValueInput.value, 10) - 1);
  });

  peoplePlus?.addEventListener('click', () => {
    syncPeopleValue(parseInt(peopleValueInput.value, 10) + 1);
  });

  peopleDone?.addEventListener('click', closePeoplePanel);

  dateTrigger?.addEventListener('click', () => {
    if (datePicker.classList.contains('is-open')) {
      closeDatePanel();
    } else {
      openDatePanel();
    }
  });

  datePrev?.addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  dateNext?.addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  dateDone?.addEventListener('click', closeDatePanel);

  languageTrigger?.addEventListener('click', () => {
    if (languagePicker.classList.contains('is-open')) {
      closeLanguagePanel();
    } else {
      openLanguagePanel();
    }
  });

  languageOptions.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.getAttribute('data-language-option');
      syncLanguageValue(value);
      if (window.innerWidth > 768) closeLanguagePanel();
    });
  });

  languageDone?.addEventListener('click', closeLanguagePanel);

  document.addEventListener('click', event => {
    if (!peoplePicker?.contains(event.target)) closePeoplePanel();
    if (!datePicker?.contains(event.target)) closeDatePanel();
    if (!languagePicker?.contains(event.target)) closeLanguagePanel();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePeoplePanel();
      closeDatePanel();
      closeLanguagePanel();
    }
  });

  syncPeopleValue(parseInt(peopleValueInput.value, 10));
  renderCalendar();
  syncLanguageValue(languageValueInput.value);

  /* ── Mobile Sticky CTA visibility logic ─── */
  const stickyCta = document.querySelector('.mobile-sticky-cta');
  const bookingCard = document.querySelector('.experience-booking');

  if (stickyCta && bookingCard && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // If booking card is visible, hide sticky CTA
        // If booking card is not visible, show sticky CTA
        if (entry.isIntersecting) {
          stickyCta.style.transform = 'translateY(100%)';
          stickyCta.style.opacity = '0';
          stickyCta.style.pointerEvents = 'none';
        } else {
          stickyCta.style.transform = 'translateY(0)';
          stickyCta.style.opacity = '1';
          stickyCta.style.pointerEvents = 'auto';
        }
      });
    }, {
      threshold: 0.1 // Trigger as soon as 10% of the booking card is visible
    });

    observer.observe(bookingCard);
  }
})();
