/**
 * Google Apps Script — Seaduced Experience
 * Booking creation, calendar management & premium email confirmations
 *
 * ARCHITECTURE
 *   Configuration        → calendar IDs constant
 *   HTTP Handlers        → doGet / doPost entry points
 *   Calendar Helpers     → availability queries & event listing
 *   Booking Creation     → direct (SumUp) booking flow
 *   GYG Parser           → auto-sync GetYourGuide emails to calendar
 *   Shared Utilities     → duration, date range, calendar search
 *   Translations         → i18n strings (EN / ES / DA)
 *   Email                → dispatcher + ICS attachment
 *   Email Templates      → guest and admin HTML
 *   Tests                → run manually from the Apps Script editor
 */

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION
═══════════════════════════════════════════════════════════ */

/** Google Calendar IDs keyed by boat name. */
var CALENDAR_IDS = {
  boat1: '478b8158512db83e1d3083ee1eafb31255589a8636a34944aeff9f38d10787f2@group.calendar.google.com',
  boat2: '3bcf707af9af431820c23c5f7684b5f6929ab45fbdd2d2a858783cce5ce9e820@group.calendar.google.com'
};

/* ═══════════════════════════════════════════════════════════
   HTTP HANDLERS
═══════════════════════════════════════════════════════════ */

/**
 * GET entry point. Dispatches based on the `action` query parameter.
 * Supported actions: getAvailability | getMonthlyAvailability | listAllBookings.
 */
function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getAvailability')
    return handleGetAvailability(e.parameter.calendar, e.parameter.date);

  if (action === 'getMonthlyAvailability') {
    var month = e.parameter.month;
    var year = e.parameter.year;
    // Accept ?date=YYYY-MM as an alternative to ?month=MM&year=YYYY
    if (!month && e.parameter.date) {
      var parts = e.parameter.date.split('-');
      year = parts[0];
      month = parts[1];
    }
    return handleGetMonthlyAvailability(e.parameter.calendar, month, year);
  }

  if (action === 'listAllBookings')
    return handleListAllBookings(e.parameter.start, e.parameter.end);

  return ContentService.createTextOutput("Action not found").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * POST entry point. Expects a JSON body with an `action` field.
 * Supported actions: createBooking.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    Logger.log("ACTION: " + action);
    Logger.log("DATA: " + JSON.stringify(data));

    var result = action === 'createBooking'
      ? handleCreateBooking(data)
      : { success: false, error: "Action not recognized" };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ═══════════════════════════════════════════════════════════
   CALENDAR HELPERS
═══════════════════════════════════════════════════════════ */

/**
 * Returns a CalendarApp instance for the given boat name.
 * Falls back to boat1 for unknown names.
 * @param {string} name - 'boat1' | 'boat2'
 * @returns {GoogleAppsScript.Calendar.Calendar}
 */
function getCalendar(name) {
  return CalendarApp.getCalendarById(CALENDAR_IDS[name] || CALENDAR_IDS.boat1);
}

/**
 * Returns busy hourly slots (08:00–21:00) for a single day on the given calendar.
 * @param {string} calendarName
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {GoogleAppsScript.Content.TextOutput} JSON { busy: [{time, available}] }
 */
function handleGetAvailability(calendarName, dateStr) {
  var calendar = getCalendar(calendarName);
  var day = new Date(dateStr);
  var startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0);
  var endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21, 0, 0);

  var busySlots = [];
  calendar.getEvents(startOfDay, endOfDay).forEach(function (e) {
    var startH = e.getStartTime().getHours();
    var endH = e.getEndTime().getHours();
    for (var h = startH; h < endH; h++)
      busySlots.push({ time: ('0' + h).slice(-2) + ':00', available: false });
  });

  return ContentService.createTextOutput(JSON.stringify({ busy: busySlots }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Returns busy hourly slots for every day in the given month.
 * @param {string} calendarName
 * @param {string|number} month - 1-based month number
 * @param {string|number} year
 * @returns {GoogleAppsScript.Content.TextOutput} JSON { 'YYYY-MM-DD': [{time, available}] }
 */
function handleGetMonthlyAvailability(calendarName, month, year) {
  var calendar = getCalendar(calendarName);
  var startOfMonth = new Date(year, month - 1, 1);
  var endOfMonth = new Date(year, month, 0, 23, 59, 59);
  var daysData = {};

  calendar.getEvents(startOfMonth, endOfMonth).forEach(function (e) {
    var start = e.getStartTime();
    var dStr = start.getFullYear() + '-'
      + ('0' + (start.getMonth() + 1)).slice(-2) + '-'
      + ('0' + start.getDate()).slice(-2);
    if (!daysData[dStr]) daysData[dStr] = [];

    var startH = start.getHours();
    var endH = e.getEndTime().getHours();
    for (var h = startH; h < endH; h++)
      daysData[dStr].push({ time: ('0' + h).slice(-2) + ':00', available: false });
  });

  return ContentService.createTextOutput(JSON.stringify(daysData))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Returns all events across both boats within a date range.
 * Defaults to the full current calendar year when no range is supplied.
 * @param {string} [startStr] - ISO date string
 * @param {string} [endStr]   - ISO date string
 * @returns {GoogleAppsScript.Content.TextOutput} JSON { events: [...] }
 */
function handleListAllBookings(startStr, endStr) {
  var start = startStr ? new Date(startStr) : new Date(new Date().getFullYear(), 0, 1);
  var end = endStr ? new Date(endStr) : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  var allEvents = [];
  ['boat1', 'boat2'].forEach(function (id) {
    var cal = getCalendar(id);
    if (!cal) return;
    cal.getEvents(start, end).forEach(function (e) {
      allEvents.push({
        id: e.getId(),
        calendar: id,
        title: e.getTitle(),
        description: e.getDescription(),
        start: e.getStartTime().toISOString(),
        end: e.getEndTime().toISOString(),
        color: e.getColor()
      });
    });
  });

  return ContentService.createTextOutput(JSON.stringify({ events: allEvents }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════
   BOOKING CREATION (Direct / SumUp)
═══════════════════════════════════════════════════════════ */

/**
 * Creates a calendar event and sends confirmation emails for a direct booking.
 * Deduplicates by SumUp checkout ID. Emails are only sent for PAID status.
 * Calendar event is colored YELLOW.
 * @param {Object} data - Booking payload from the POST body.
 * @returns {{ success: boolean, eventId?: string, status?: string, message?: string, error?: string }}
 */
function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar || 'boat1');

  // Skip if this SumUp checkout was already processed
  if (data.sumup_checkout_id && data.sumup_checkout_id !== 'N/A') {
    var existing = findEventBySumUpId(data.sumup_checkout_id);
    if (existing) {
      Logger.log("Duplicate (SumUp ID: " + data.sumup_checkout_id + "). Skipping.");
      return { success: true, message: "Duplicate avoided", eventId: existing.getId() };
    }
  }

  var tour = data.tour || data.tourTitle || "";
  var range = buildStartEnd(data.date, data.time, getTourDurationHours(tour, 1));
  var status = data.payment_status || 'PAID';

  var description =
    "✨ " + tour.toUpperCase() + "\n" +
    "📅 " + data.date + " | 🕒 " + (data.time || "N/A") + "\n" +
    "👥 Passengers: " + (data.qty || "N/A") + "\n" +
    "🌍 Language: " + (data.lang || "N/A") + "\n" +
    "🍷 Extras: " + (data.tapas && data.tapas != "0" ? data.tapas + " Tapas/Charcuterie" : "None") + "\n\n" +
    "👤 CONTACT\n" +
    "Name: " + (data.name || "N/A") + "\n" +
    "Email: " + (data.email || "N/A") + "\n" +
    "Phone: " + (data.phone || "N/A") + "\n" +
    "──────────────────────────\n" +
    "SumUp ID: " + (data.sumup_checkout_id || "N/A") + "\n" +
    "Amount: " + (data.amount ? data.amount + " " + (data.currency || "") : "N/A") + "\n" +
    "Status: " + status;

  var event = calendar.createEvent(
    "Reserva: " + (data.name || 'Cliente'),
    range.start, range.end,
    { description: description }
  );
  event.setColor(CalendarApp.EventColor.YELLOW);

  if (status === 'PAID' || status === 'paid') {
    if (data.email) {
      try { event.addGuest(data.email); } catch (e) { Logger.log("Guest error: " + e); }
    }
    try {
      sendBookingEmails(data, getTranslations(data.lang || 'english'), range.start, range.end);
    } catch (e) {
      event.setDescription(description + "\n\n[EMAIL ERROR]: " + e.toString());
    }
  }

  return { success: true, eventId: event.getId(), status: status };
}

/**
 * Searches both calendars for an event linked to the given SumUp checkout ID.
 * @param {string} sumupId
 * @returns {GoogleAppsScript.Calendar.CalendarEvent|null}
 */
function findEventBySumUpId(sumupId) {
  return findEventByDescriptionFragment("SumUp ID: " + sumupId);
}

/* ═══════════════════════════════════════════════════════════
   GYG EMAIL PARSER — Auto-sync GetYourGuide bookings to Calendar
   ─────────────────────────────────────────────────────────
   SETUP  Run setupGYGTrigger() once from the editor to install
          the 15-min time-based trigger, then authorize Gmail.
   TEST   Run testGYGParser() to dry-run against the latest
          unread GYG email without creating duplicates.
═══════════════════════════════════════════════════════════ */

/**
 * Installs a 15-minute time-based trigger for processGYGBookings().
 * Removes any existing triggers with the same handler first to prevent duplicates.
 * Run once from the Apps Script editor.
 */
function setupGYGTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'processGYGBookings'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('processGYGBookings')
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log("✅ GYG trigger set — processGYGBookings() runs every 15 min.");
}

/**
 * Main GYG entry point — called automatically every 15 min by the trigger.
 * Scans unread GYG booking emails from the last 15 days, parses each message,
 * and creates a calendar event for any booking not already in the calendar.
 */
function processGYGBookings() {
  var threads = GmailApp.search(
    'from:do-not-reply@notification.getyourguide.com subject:Booking newer_than:15d'
  );

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      try {
        var booking = parseGYGEmail(msg);
        if (booking) {
          var eventId = createGYGCalendarEvent(booking);
          Logger.log("GYG booked → " + booking.gygRef + " | event: " + eventId);
        }
      } catch (e) {
        Logger.log("GYG parse error: " + e.toString());
      }
    });
  });
}

/**
 * Parses a GYG booking confirmation email into a structured booking object.
 * Returns null if the email is not a GYG booking or if it already exists in the calendar.
 * @param {GoogleAppsScript.Gmail.GmailMessage} msg
 * @param {boolean} [skipDedup=false] - Pass true to bypass deduplication (used in tests).
 * @returns {Object|null} Parsed booking or null.
 */
function parseGYGEmail(msg, skipDedup) {
  var subject = msg.getSubject();
  var body = msg.getPlainBody();

  // GYG reference from subject — e.g. "Booking - S467793 - GYG6H8ALG4M9"
  var refMatch = subject.match(/\b(GYG[A-Z0-9]+)\b/);
  if (!refMatch) return null;
  var gygRef = refMatch[1];

  // Skip if already in calendar
  if (!skipDedup && findGYGEvent(gygRef)) {
    Logger.log("Already in calendar: " + gygRef);
    return null;
  }

  // Tour name — first line after "Your offer has been booked:"
  var tourMatch = body.match(/Your offer has been booked:\s*\n+([^\n]+)/);
  var tour = tourMatch ? tourMatch[1].trim() : 'GYG Tour';

  // Date + time — GYG sends e.g. "September 4, 2026 5:00 PM" on the Date line
  var dateStr = '—';
  var timeStr = '10:00'; // fallback when GYG omits a time slot
  var dateMatch = body.match(/\bDate\b\s*\n([^\n]+)/);
  if (dateMatch) {
    var d = new Date(dateMatch[1].trim());
    if (!isNaN(d.getTime())) {
      dateStr = d.getFullYear() + '-'
        + ('0' + (d.getMonth() + 1)).slice(-2) + '-'
        + ('0' + d.getDate()).slice(-2);
      timeStr = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  }

  // Participants — handles "1 x Group up to 6 (2 Persons)" and "2 x Adult"
  var qty = '1';
  var paxMatch = body.match(/Number of participants\s*\n([^\n]+)/);
  if (paxMatch) {
    var parenMatch = paxMatch[1].match(/\((\d+)\s*Persons?\)/i);
    var simpleMatch = paxMatch[1].match(/^(\d+)\s*x/);
    qty = parenMatch ? parenMatch[1] : (simpleMatch ? simpleMatch[1] : qty);
  }

  // Language (first "Language:" occurrence = customer language)
  var lang = 'english';
  var langMatch = body.match(/Language:\s*([^\n]+)/);
  if (langMatch) {
    var l = langMatch[1].toLowerCase();
    if (l.indexOf('spanish') !== -1 || l.indexOf('español') !== -1) lang = 'spanish';
    else if (l.indexOf('danish') !== -1 || l.indexOf('dansk') !== -1) lang = 'danish';
  }

  // Price — e.g. "DKK 8,999.00"
  var amount = '', currency = 'DKK';
  var priceMatch = body.match(/\bPrice\b\s*\n([^\n]+)/);
  if (priceMatch) {
    var ps = priceMatch[1].trim();
    var currMatch = ps.match(/^([A-Z]{3})/);
    var numMatch = ps.match(/([\d,\.]+)/);
    if (currMatch) currency = currMatch[1];
    if (numMatch) amount = numMatch[1].replace(/,/g, '');
  }

  var nameMatch = body.match(/Main customer\s*\n([^\n]+)/);
  var emailMatch = body.match(/customer-[a-z0-9]+@reply\.getyourguide\.com/);
  var phoneMatch = body.match(/Phone:\s*([^\n]+)/);

  return {
    gygRef: gygRef,
    tour: tour,
    date: dateStr,
    time: timeStr,
    qty: qty,
    name: nameMatch ? nameMatch[1].trim() : 'GYG Guest',
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    lang: lang,
    amount: amount,
    currency: currency
  };
}

/**
 * Creates a Google Calendar event from a parsed GYG booking.
 * Colored ORANGE to distinguish from direct bookings (YELLOW).
 * Placed on boat1 by default. Time note added when GYG omits a slot.
 * @param {Object} booking - Output of parseGYGEmail().
 * @returns {string} Created event ID.
 */
function createGYGCalendarEvent(booking) {
  var range = buildStartEnd(booking.date, booking.time, getTourDurationHours(booking.tour, 2));

  var description =
    "✨ " + booking.tour.toUpperCase() + "\n" +
    "📅 " + booking.date + " | 🕒 " + booking.time + " ⚠️ (confirm time with guest)\n" +
    "👥 Passengers: " + booking.qty + "\n" +
    "🌍 Language: " + booking.lang + "\n\n" +
    "👤 CONTACT\n" +
    "Name: " + booking.name + "\n" +
    "Email: " + booking.email + "\n" +
    "Phone: " + booking.phone + "\n" +
    "──────────────────────────\n" +
    "GYG Ref: " + booking.gygRef + "\n" +
    "Amount: " + booking.amount + " " + booking.currency + "\n" +
    "Source: GetYourGuide";

  var event = getCalendar('boat1').createEvent(
    "🟠 GYG: " + booking.name,
    range.start, range.end,
    { description: description }
  );
  event.setColor(CalendarApp.EventColor.ORANGE);

  return event.getId();
}

/**
 * Searches both calendars for an existing event linked to the given GYG reference.
 * @param {string} gygRef
 * @returns {GoogleAppsScript.Calendar.CalendarEvent|null}
 */
function findGYGEvent(gygRef) {
  return findEventByDescriptionFragment("GYG Ref: " + gygRef);
}

/* ═══════════════════════════════════════════════════════════
   SHARED UTILITIES
═══════════════════════════════════════════════════════════ */

/**
 * Derives tour duration in hours from the tour name by keyword matching.
 * @param {string} tour
 * @param {number} [defaultHours=1] - Returned when no keyword matches.
 * @returns {number}
 */
function getTourDurationHours(tour, defaultHours) {
  // 2-hour Highlights variants must be checked BEFORE the generic 'Highlights' → 1h rule
  if (tour.indexOf('2 Hours') !== -1 ||
    tour.indexOf('book-1h-2h') !== -1 ||
    tour.indexOf('book-10p-2h') !== -1) return 2;
  if (tour.indexOf('1-Hour') !== -1 ||
    tour.indexOf('Highlights') !== -1 ||
    tour.indexOf('book-1h') !== -1 ||
    tour.indexOf('book-10p') !== -1) return 1;
  if (tour.indexOf('Floating Wine') !== -1) return 2;
  if (tour.indexOf('3-Hour') !== -1) return 3;
  if (tour.indexOf('4-Hour') !== -1 ||
    tour.indexOf('Canal Cruise') !== -1) return 4;
  if (tour.indexOf('Malmö') !== -1 ||
    tour.indexOf('Dragør') !== -1 ||
    tour.indexOf('Helsingør') !== -1) return 7;
  return defaultHours !== undefined ? defaultHours : 1;
}

/**
 * Builds a { start, end } Date pair from date/time strings and a duration.
 * @param {string} dateStr   - 'YYYY-MM-DD'
 * @param {string} timeStr   - 'HH:MM'
 * @param {number} durationH - Duration in hours.
 * @returns {{ start: Date, end: Date }}
 */
function buildStartEnd(dateStr, timeStr, durationH) {
  var dp = dateStr.split('-');
  var tp = timeStr.split(':');
  var start = new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0], +tp[1]);
  var end = new Date(start.getTime() + durationH * 3600000);
  return { start: start, end: end };
}

/**
 * Searches both boat calendars (now → +1 year) for an event whose description
 * contains `fragment`. Shared deduplication logic for SumUp and GYG flows.
 * @param {string} fragment - Substring to find in event descriptions.
 * @returns {GoogleAppsScript.Calendar.CalendarEvent|null}
 */
function findEventByDescriptionFragment(fragment) {
  var now = new Date();
  var future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  var calendars = [getCalendar('boat1'), getCalendar('boat2')]
    .filter(function (c) { return c !== null; });

  for (var i = 0; i < calendars.length; i++) {
    try {
      var events = calendars[i].getEvents(now, future);
      for (var j = 0; j < events.length; j++) {
        var desc = events[j].getDescription();
        if (desc && desc.indexOf(fragment) !== -1) return events[j];
      }
    } catch (e) {
      Logger.log("Error searching calendar " + i + ": " + e.toString());
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   TRANSLATIONS
═══════════════════════════════════════════════════════════ */

/**
 * Returns the i18n string map for the given language.
 * Falls back to English for unknown languages.
 * @param {string} lang - 'english' | 'spanish' | 'danish'
 * @returns {Object}
 */
function getTranslations(lang) {
  var map = {
    english: {
      subject: "Your booking is confirmed!",
      greeting: "Hi {name},",
      confirmed: "Your booking is confirmed",
      subheading: "We can't wait to welcome you on board. Here are your booking details:",
      refNumber: "Reference",
      tour: "Experience",
      date: "Date",
      time: "Departure",
      passengers: "Passengers",
      language: "Language",
      extras: "Extras",
      amount: "Amount paid",
      location: "Meeting point",
      locationVal: "Christians Brygge 28, c/o Housing Group A, S, sal sttv, 1219 København",
      locationHint: "Right beside The Raft. At the dock, in front of the Kayak Bar. Look for the Seaduced boat.",
      mapButton: "Get directions",
      helpTitle: "Need help?",
      helpBody: "Contact us via WhatsApp or reply to this email — we're always happy to help.",
      tagline: "See you on the water.",
      footer: "© Seaduced Experience · Copenhagen, Denmark"
    },
    spanish: {
      subject: "¡Tu reserva está confirmada!",
      greeting: "Hola {name},",
      confirmed: "Tu reserva está confirmada",
      subheading: "Estamos deseando darte la bienvenida a bordo. Aquí tienes los detalles de tu reserva:",
      refNumber: "Referencia",
      tour: "Experiencia",
      date: "Fecha",
      time: "Salida",
      passengers: "Pasajeros",
      language: "Idioma",
      extras: "Extras",
      amount: "Importe pagado",
      location: "Punto de encuentro",
      locationVal: "Christians Brygge 28, c/o Housing Group A, S, sal sttv, 1219 København",
      locationHint: "Justo al lado de The Raft. En el muelle, frente al Kayak Bar. Busca el barco de Seaduced.",
      mapButton: "Cómo llegar",
      helpTitle: "¿Necesitas ayuda?",
      helpBody: "Contáctanos por WhatsApp o respondiendo este email — estamos aquí para ayudarte.",
      tagline: "Nos vemos en el agua.",
      footer: "© Seaduced Experience · Copenhague, Dinamarca"
    },
    danish: {
      subject: "Din booking er bekræftet!",
      greeting: "Hej {name},",
      confirmed: "Din booking er bekræftet",
      subheading: "Vi glæder os til at byde dig velkommen om bord. Her er dine bookingdetaljer:",
      refNumber: "Reference",
      tour: "Oplevelse",
      date: "Dato",
      time: "Afgang",
      passengers: "Passagerer",
      language: "Sprog",
      extras: "Extras",
      amount: "Betalt beløb",
      location: "Mødested",
      locationVal: "Christians Brygge 28, c/o Housing Group A, S, sal sttv, 1219 København",
      locationHint: "Lige ved siden af The Raft. Ved molen, foran Kayak Bar. Find Seaduced-båden.",
      mapButton: "Se rutevejledning",
      helpTitle: "Brug for hjælp?",
      helpBody: "Kontakt os via WhatsApp eller svar på denne e-mail — vi hjælper altid gerne.",
      tagline: "Vi ses på vandet.",
      footer: "© Seaduced Experience · København, Danmark"
    }
  };
  return map[lang] || map.english;
}

/* ═══════════════════════════════════════════════════════════
   EMAIL
═══════════════════════════════════════════════════════════ */

/**
 * Sends a confirmation email to the guest and a notification to the admin.
 * Attaches a .ics calendar invite to the guest email.
 * @param {Object} data  - Booking payload.
 * @param {Object} t     - Translation strings from getTranslations().
 * @param {Date}   start - Event start time.
 * @param {Date}   end   - Event end time.
 */
function sendBookingEmails(data, t, start, end) {
  var tourTitle = data.tour || data.tourTitle;
  var icsBlob = createIcsBlob("Seaduced Experience: " + tourTitle, start, end, t.locationVal);

  if (data.email) {
    GmailApp.sendEmail(data.email, "Seaduced Experience — " + t.subject, "", {
      name: "Seaduced Experience",
      htmlBody: getGuestHtmlTemplate(data, t),
      attachments: [icsBlob]
    });
  }

  var adminEmail = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(
    adminEmail,
    "⚓ Nueva Reserva — " + tourTitle + " · " + (data.name || "") + " · " + (data.date || ""),
    "",
    { name: "Seaduced Bookings", htmlBody: getAdminHtmlTemplate(data, t) }
  );
}

/**
 * Builds a .ics calendar attachment blob.
 * @param {string} title    - Event summary text.
 * @param {Date}   start    - Event start.
 * @param {Date}   end      - Event end.
 * @param {string} location - Meeting point address.
 * @returns {GoogleAppsScript.Base.Blob}
 */
function createIcsBlob(title, start, end, location) {
  var ics =
    "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n" +
    "DTSTART:" + Utilities.formatDate(start, "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
    "DTEND:" + Utilities.formatDate(end, "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
    "SUMMARY:" + title + "\n" +
    "LOCATION:" + location + "\n" +
    "END:VEVENT\nEND:VCALENDAR";
  return Utilities.newBlob(ics, "text/calendar", "seaduced-booking.ics");
}

/* ═══════════════════════════════════════════════════════════
   EMAIL TEMPLATES
   Brand colors: navy #0f1e35 | orange #e8834a | muted #4a5568
═══════════════════════════════════════════════════════════ */

/**
 * Renders a table row used in both guest and admin email templates.
 * Shared implementation behind detailRow() and adminRow().
 * @private
 * @param {string}  label      - Left cell text.
 * @param {string}  value      - Right cell HTML.
 * @param {boolean} isLast     - Omits the bottom border when true.
 * @param {string}  padding    - CSS vertical padding (e.g. '14px').
 * @param {string}  labelWidth - CSS width of the label cell (e.g. '45%').
 * @returns {string} HTML <tr> string.
 */
function _tableRow(label, value, isLast, padding, labelWidth) {
  var border = isLast ? '' : 'border-bottom:1px solid #e8ecf2;';
  return '<tr>' +
    '<td style="padding:' + padding + ' 0;' + border + 'width:' + labelWidth + ';font-size:13px;color:#4a5568;">' + label + '</td>' +
    '<td style="padding:' + padding + ' 0;' + border + 'font-size:14px;color:#0f1e35;font-weight:600;text-align:right;">' + value + '</td>' +
    '</tr>';
}

/** Guest email detail row — wider label column. */
function detailRow(label, value, isLast) { return _tableRow(label, value, isLast, '14px', '45%'); }

/** Admin email detail row — narrower label column. */
function adminRow(label, value, isLast) { return _tableRow(label, value, isLast, '13px', '40%'); }

/**
 * Returns the full HTML string for the guest booking confirmation email.
 * Includes booking details, meeting point, CTA button, and help section.
 * @param {Object} data - Booking payload.
 * @param {Object} t    - Translation strings.
 * @returns {string} HTML email body.
 */
function getGuestHtmlTemplate(data, t) {
  var greeting = t.greeting.replace("{name}", data.name || "there");
  var tourName = data.tour || data.tourTitle || "—";
  var extras = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    /* ── Orange top bar ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    /* ── Header ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">EXPERIENCE &nbsp;·&nbsp; COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    /* ── Body ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    /* ── Intro card ── */
    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;margin-bottom:16px;border-top:3px solid #e8834a;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">' + greeting + '</p>' +
    '<p style="margin:0 0 20px;font-size:15px;color:#0f1e35;font-weight:600;">' + t.confirmed + '</p>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.7;">' + t.subheading + '</p>' +
    '</td></tr>' +

    '<tr><td style="height:12px;"></td></tr>' +

    /* ── Booking details card ── */
    '<tr><td style="background:#ffffff;border-radius:12px;padding:0;overflow:hidden;">' +

    /* Card header */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:20px 28px;">' +
    '<div style="font-size:10px;letter-spacing:3px;color:#e8834a;font-weight:700;margin-bottom:8px;">YOUR EXPERIENCE</div>' +
    '<div style="font-size:18px;color:#ffffff;font-weight:600;">' + tourName + '</div>' +
    '<div translate="no" style="margin-top:6px;font-size:12px;color:#718096;">Seaduced Experience · Copenhagen</div>' +
    '</td>' +
    '</tr></table>' +

    /* Detail rows */
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px;">' +
    detailRow(t.date, data.date || '—') +
    detailRow(t.time, data.time || '—') +
    detailRow(t.passengers, (data.qty || '—') + ' person(s)') +
    detailRow(t.language, langLabel) +
    detailRow(t.extras, extras) +
    detailRow(t.amount, '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
    detailRow(t.refNumber, '<span style="color:#e8834a;">' + refNumber + '</span>', true) +
    '</table>' +

    /* Meeting point strip */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#f5f6f8;border-top:1px solid #e8ecf2;padding:16px 28px;">' +
    '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">MEETING POINT</div>' +
    '<div style="font-size:13px;color:#0f1e35;font-weight:600;">' + t.locationVal + '</div>' +
    '<div style="font-size:12px;color:#4a5568;margin-top:4px;">' + t.locationHint + '</div>' +
    '</td>' +
    '</tr></table>' +

    /* CTA */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="padding:24px 28px;text-align:center;">' +
    '<a href="https://www.google.com/maps/search/?api=1&query=Christians+Brygge+28+1219+Kobenhavn" ' +
    'style="display:inline-block;background-color:#e8834a;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">' +
    t.mapButton.toUpperCase() +
    '</a>' +
    '</td>' +
    '</tr></table>' +

    '</td></tr>' +

    '<tr><td style="height:12px;"></td></tr>' +

    /* ── Help card ── */
    '<tr><td style="background:#ffffff;border-radius:12px;padding:24px 28px;">' +
    '<p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f1e35;">' + t.helpTitle + '</p>' +
    '<p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.7;">' + t.helpBody + '</p>' +
    '<p style="margin:0;">' +
    '<a href="tel:+4522561882" style="font-size:14px;color:#e8834a;font-weight:700;text-decoration:none;">+45 22 56 18 82</a>' +
    '</p>' +
    '</td></tr>' +

    /* ── Footer ── */
    '<tr><td style="padding:32px 0 16px;text-align:center;">' +
    '<p style="margin:0 0 4px;font-size:14px;color:#718096;font-style:italic;">' + t.tagline + '</p>' +
    '<p translate="no" style="margin:8px 0 0;font-size:11px;letter-spacing:1px;color:#a0aec0;">' + t.footer + '</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr></table>' +

    /* ── Navy bottom bar ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '</body></html>';
}

/**
 * Returns the full HTML string for the internal admin notification email.
 * Includes a stats strip (passengers, language, extras) and full booking details.
 * @param {Object} data - Booking payload.
 * @param {Object} t    - Translation strings.
 * @returns {string} HTML email body.
 */
function getAdminHtmlTemplate(data, t) {
  var tourName = data.tour || data.tourTitle || "—";
  var extras = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    /* ── Orange top bar ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    /* ── Header ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:24px 32px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td>' +
    '<div translate="no" style="font-size:13px;letter-spacing:4px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:3px;color:#e8834a;margin-top:4px;">BOOKING SYSTEM</div>' +
    '</td>' +
    '<td style="text-align:right;">' +
    '<div style="display:inline-block;background-color:#1c3a1a;border:1px solid #2d5a1b;border-radius:4px;padding:6px 14px;">' +
    '<span style="font-size:11px;color:#5aaa3a;font-weight:700;letter-spacing:1px;">PAID</span>' +
    '</div>' +
    '</td>' +
    '</tr></table>' +
    '</td>' +
    '</tr></table>' +

    /* ── Body ── */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 16px 40px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">' +

    /* ── Headline card ── */
    '<tr><td style="background:#ffffff;border-radius:12px 12px 0 0;padding:28px 32px 20px;border-bottom:3px solid #e8834a;">' +
    '<p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0f1e35;">Nueva reserva recibida</p>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;">' + tourName + ' &nbsp;·&nbsp; ' + (data.date || '') + ' &nbsp;·&nbsp; ' + (data.time || '') + '</p>' +
    '</td></tr>' +

    /* ── Stats strip ── */
    '<tr><td style="background:#f5f6f8;padding:16px 32px;border-left:1px solid #e8ecf2;border-right:1px solid #e8ecf2;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="text-align:center;padding:8px;">' +
    '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">PASAJEROS</div>' +
    '<div style="font-size:22px;font-weight:700;color:#0f1e35;">' + (data.qty || '—') + '</div>' +
    '</td>' +
    '<td style="width:1px;background:#e8ecf2;">&nbsp;</td>' +
    '<td style="text-align:center;padding:8px;">' +
    '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">IDIOMA</div>' +
    '<div style="font-size:22px;font-weight:700;color:#0f1e35;">' + langLabel.substring(0, 2).toUpperCase() + '</div>' +
    '</td>' +
    '<td style="width:1px;background:#e8ecf2;">&nbsp;</td>' +
    '<td style="text-align:center;padding:8px;">' +
    '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">EXTRAS</div>' +
    '<div style="font-size:22px;font-weight:700;color:#0f1e35;">' + ((data.tapas && data.tapas != "0") ? data.tapas : '0') + '</div>' +
    '</td>' +
    '</tr></table>' +
    '</td></tr>' +

    /* ── Booking details ── */
    '<tr><td style="background:#ffffff;padding:8px 32px;border-left:1px solid #e8ecf2;border-right:1px solid #e8ecf2;">' +
    '<p style="font-size:10px;letter-spacing:2px;color:#e8834a;font-weight:700;margin:20px 0 4px;">DATOS DE LA RESERVA</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    adminRow('Importe', '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
    adminRow('Referencia SumUp', '<span style="color:#e8834a;">' + refNumber + '</span>') +
    adminRow('Experiencia', tourName) +
    adminRow('Fecha', data.date || '—') +
    adminRow('Hora', data.time || '—') +
    adminRow('Extras', extras, true) +
    '</table>' +
    '<p style="font-size:10px;letter-spacing:2px;color:#e8834a;font-weight:700;margin:24px 0 4px;">DATOS DEL CLIENTE</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    adminRow('Nombre', data.name || '—') +
    adminRow('Email', data.email || '—') +
    adminRow('Telefono', data.phone || '—', true) +
    '</table>' +
    '<div style="height:20px;"></div>' +
    '</td></tr>' +

    /* ── Footer strip ── */
    '<tr><td style="background-color:#0f1e35;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">' +
    '<p translate="no" style="margin:0;font-size:10px;letter-spacing:2px;color:#4a6080;">SEADUCED EXPERIENCE &nbsp;·&nbsp; PANEL INTERNO</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr></table>' +

    '</body></html>';
}

/* ═══════════════════════════════════════════════════════════
   TESTS — run manually from the Apps Script editor
═══════════════════════════════════════════════════════════ */

/** Verifies that both calendars resolve correctly and logs their names. */
function testCalendar() {
  var cal1 = CalendarApp.getCalendarById(CALENDAR_IDS.boat1);
  var cal2 = CalendarApp.getCalendarById(CALENDAR_IDS.boat2);
  Logger.log("Calendario 1: " + (cal1 ? cal1.getName() : "NULL (No encontrado)"));
  Logger.log("Calendario 2: " + (cal2 ? cal2.getName() : "NULL (No encontrado)"));
}

/**
 * Sends a test booking confirmation using hardcoded data.
 * Also triggers Gmail authorization if not yet granted.
 */
function testEmail() {
  var data = {
    name: "Nick",
    email: "seaducedexperience@gmail.com",
    phone: "+45 123 312",
    tour: "Copenhagen City Highlights",
    date: "2026-05-26",
    time: "10:00",
    qty: "2",
    lang: "english",
    tapas: "2",
    sumup_checkout_id: "TEST-001"
  };
  var t = getTranslations("english");
  var range = buildStartEnd("2026-05-26", "10:00", 1);
  sendBookingEmails(data, t, range.start, range.end);
  Logger.log("Guest email sent to: " + data.email);
  Logger.log("Admin email sent to: " + Session.getEffectiveUser().getEmail());
}

/**
 * Dry-runs GYG email parsing against the latest GYG email in Gmail.
 * Skips calendar deduplication so the same email can be tested repeatedly.
 * Does NOT create a calendar event.
 */
function testGYGParser() {
  var threads = GmailApp.search(
    'from:do-not-reply@notification.getyourguide.com subject:Booking',
    0, 1
  );
  if (!threads.length) { Logger.log("No GYG emails found."); return; }

  var msg = threads[0].getMessages()[0];
  var subject = msg.getSubject();
  var refMatch = subject.match(/\b(GYG[A-Z0-9]+)\b/);
  Logger.log("GYG Ref: " + (refMatch ? refMatch[1] : "NOT FOUND"));

  var booking = parseGYGEmail(msg, true); // skipDedup = true
  Logger.log("Parsed booking: " + JSON.stringify(booking, null, 2));
}
