/**
 * Google Apps Script — Seaduced Experience [DEMO]
 * Booking creation, calendar management & premium email confirmations
 *
 * ARCHITECTURE
 *   Configuration        → calendar IDs constant
 *   HTTP Handlers        → doGet / doPost entry points
 *   Calendar Helpers     → availability queries & event listing
 *   Booking Creation     → direct (SumUp) booking flow
 *   Shared Utilities     → duration, date range, calendar search
 *   Translations         → i18n strings (EN / ES / DA)
 *   Email                → dispatcher + ICS attachment
 *   Email Templates      → guest and admin HTML
 *   Tests                → run manually from the Apps Script editor
 */

/* ═══════════════════════════════════════════════════════════
   CONFIGURATION — DEMO CREDENTIALS
═══════════════════════════════════════════════════════════ */

var CALENDAR_IDS = {
  boat1: 'ad4644278f9ee9075ebb8a8bb0c8eca457cdc3fe908bd4b1eb7cd3b5f751ca71@group.calendar.google.com',
  boat2: '2772126ed76f0380789fb1af0e56d9e55313cc013cfc55f6e4f3b12b7cc35e72@group.calendar.google.com'
};

/* ═══════════════════════════════════════════════════════════
   HTTP HANDLERS
═══════════════════════════════════════════════════════════ */

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getAvailability')
    return handleGetAvailability(e.parameter.calendar, e.parameter.date);

  if (action === 'getMonthlyAvailability') {
    var month = e.parameter.month;
    var year = e.parameter.year;
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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    Logger.log("ACTION: " + action);
    Logger.log("DATA: " + JSON.stringify(data));

    var result = action === 'createBooking'
      ? handleCreateBooking(data)
      : action === 'createCalendarOnly'
        ? handleCreateCalendarOnly(data)
        : action === 'resendEmail'
          ? handleResendEmail(data)
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

function getCalendar(name) {
  return CalendarApp.getCalendarById(CALENDAR_IDS[name] || CALENDAR_IDS.boat1);
}

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

function getTourDisplayName(tourCode) {
  var names = {
    'book-1h': 'City Highlights',
    'book-1h-2h': 'City Highlights (2 Hours)',
    'book-10p': 'City Highlights (10 Guests)',
    'book-10p-2h': 'City Highlights (10 Guests) (2 Hours)',
    'book-wine': 'Floating Wine Tasting Experience',
    'book-premium': 'Sea Fortress and Coastal Journey (4-Hour)',
    'book-reffen': 'Private 3-Hour Extended (Reffen)',
    'book-malmo': 'Copenhagen to Malmö Experience',
    'book-land': 'Copenhagen Private Boat y Land Experience',
    'book-winter': '2-Hour Winter Hygge 2026',
    'book-winter-captain': 'Private Boat Tour with Captain',
    'book-winter-hygge': 'Private Hygge Winter Tour',
    'book-christmas': 'Christmas Tour w. Tapas and Champagne'
  };
  return names[tourCode] || tourCode;
}

function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar || 'boat1');

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
  var endTime = ('0' + range.end.getHours()).slice(-2) + ':' + ('0' + range.end.getMinutes()).slice(-2);

  var description =
    "✨ " + getTourDisplayName(tour) + "\n" +
    "📅 " + data.date + " | 🕒 " + (data.time || "N/A") + " - " + endTime + "\n" +
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

function findEventBySumUpId(sumupId) {
  return findEventByDescriptionFragment("SumUp ID: " + sumupId);
}

/**
 * GYG bookings — create calendar event only, no email.
 * GYG already sends their own confirmation to the customer.
 */
function handleCreateCalendarOnly(data) {
  var calendar = getCalendar(data.calendar || 'boat1');

  if (data.gyg_booking_id) {
    var existing = findEventByDescriptionFragment("GYG Ref: " + data.gyg_booking_id);
    if (existing) {
      Logger.log("Duplicate GYG booking: " + data.gyg_booking_id + ". Skipping.");
      return { success: true, message: "Duplicate avoided", eventId: existing.getId() };
    }
  }

  var tour = data.tour || data.tourTitle || "";
  var range = buildStartEnd(data.date, data.time, getTourDurationHours(tour, 1));
  var endTime = ('0' + range.end.getHours()).slice(-2) + ':' + ('0' + range.end.getMinutes()).slice(-2);

  var description =
    "✨ " + getTourDisplayName(tour) + "\n" +
    "📅 " + data.date + " | 🕒 " + (data.time || "N/A") + " - " + endTime + "\n" +
    "👥 Passengers: " + (data.qty || "N/A") + "\n" +
    "🌍 Language: " + (data.lang || "N/A") + "\n\n" +
    "👤 CONTACT\n" +
    "Name: " + (data.name || "N/A") + "\n" +
    "Email: " + (data.email || "N/A") + "\n" +
    "Phone: " + (data.phone || "N/A") + "\n" +
    "──────────────────────────\n" +
    "GYG Ref: " + (data.gyg_booking_id || "N/A") + "\n" +
    "Amount: " + (data.amount ? data.amount + " " + (data.currency || "") : "N/A") + "\n" +
    "Source: GetYourGuide";

  var event = calendar.createEvent(
    "GYG: " + (data.name || 'Cliente') + " " + (data.qty || '') + "p",
    range.start, range.end,
    { description: description }
  );
  event.setColor(CalendarApp.EventColor.CYAN);

  var adminEmail = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(
    adminEmail,
    "⚓ GYG Reserva — " + getTourDisplayName(tour) + " · " + (data.name || "") + " · " + (data.date || ""),
    "",
    { name: "Seaduced Bookings", htmlBody: getAdminHtmlTemplate({ ...data, sumup_checkout_id: data.gyg_booking_id }, getTranslations('english'), endTime) }
  );

  Logger.log("GYG calendar event created: " + event.getId());
  return { success: true, eventId: event.getId() };
}

/* ═══════════════════════════════════════════════════════════
   SHARED UTILITIES
═══════════════════════════════════════════════════════════ */

function getTourDurationHours(tour, defaultHours) {
  if (tour.indexOf('2 Hours') !== -1 ||
    tour.indexOf('2-Hours') !== -1 ||
    tour.indexOf('book-1h-2h') !== -1 ||
    tour.indexOf('book-10p-2h') !== -1) return 2;

  if (tour.indexOf('1 Hour') !== -1 ||
    tour.indexOf('1-Hour') !== -1 ||
    tour.indexOf('Highlights') !== -1 ||
    tour.indexOf('book-1h') !== -1 ||
    tour.indexOf('book-10p') !== -1) return 1;

  if (tour.indexOf('Floating Wine') !== -1) return 2;

  if (tour.indexOf('3 Hour') !== -1 ||
    tour.indexOf('3-Hour') !== -1) return 3;

  if (tour.indexOf('4 Hour') !== -1 ||
    tour.indexOf('4-Hour') !== -1 ||
    tour.indexOf('Canal Cruise') !== -1) return 4;

  if (tour.indexOf('Malmö') !== -1 ||
    tour.indexOf('Dragør') !== -1 ||
    tour.indexOf('Helsingør') !== -1) return 7;

  return defaultHours !== undefined ? defaultHours : 1;
}

function buildStartEnd(dateStr, timeStr, durationH) {
  var dp = dateStr ? dateStr.split('-') : [];
  var tp = timeStr ? timeStr.split(':') : [];

  var start;
  if (dp.length === 3 && tp.length === 2 && !isNaN(+dp[0])) {
    start = new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0], +tp[1]);
  } else {
    Logger.log("buildStartEnd: invalid date/time '" + dateStr + " " + timeStr + "' — using now as fallback");
    start = new Date();
  }

  var end = new Date(start.getTime() + durationH * 3600000);
  return { start: start, end: end };
}

function findEventByDescriptionFragment(fragment) {
  var now = new Date();
  var past = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  var calendars = [getCalendar('boat1'), getCalendar('boat2')]
    .filter(function (c) { return c !== null; });

  for (var i = 0; i < calendars.length; i++) {
    try {
      var events = calendars[i].getEvents(past, future);
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

function handleResendEmail(data) {
  if (!data.email || !data.date || !data.time) {
    return { success: false, error: "Missing email, date or time" };
  }
  try {
    var t = getTranslations(data.lang || 'english');
    var range = buildStartEnd(data.date, data.time, getTourDurationHours(data.tour || '', 1));
    sendBookingEmails(data, t, range.start, range.end);
    Logger.log("Resend email sent to: " + data.email);
    return { success: true };
  } catch (e) {
    Logger.log("Resend email error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

function sendBookingEmails(data, t, start, end) {
  var tourTitle = data.tourTitle || data.tour;
  var tourDisplayName = data.tourTitle || getTourDisplayName(data.tour || "");
  var endTime = ('0' + end.getHours()).slice(-2) + ':' + ('0' + end.getMinutes()).slice(-2);
  var icsBlob = createIcsBlob("Seaduced Experience: " + tourDisplayName, start, end, t.locationVal);

  var isValidEmail = data.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  if (isValidEmail) {
    try {
      GmailApp.sendEmail(data.email, "Seaduced Experience — " + t.subject, "", {
        name: "Seaduced Experience",
        htmlBody: getGuestHtmlTemplate(data, t, endTime),
        attachments: [icsBlob]
      });
    } catch (e) {
      Logger.log("Guest email error: " + e);
    }
  } else {
    Logger.log("Invalid or missing guest email: " + data.email);
  }

  var adminEmail = Session.getEffectiveUser().getEmail();
  try {
    GmailApp.sendEmail(
      adminEmail,
      "⚓ Nueva Reserva — " + tourDisplayName + " · " + (data.name || "") + " · " + (data.date || ""),
      "",
      { name: "Seaduced Bookings", htmlBody: getAdminHtmlTemplate(data, t, endTime) }
    );
  } catch (e) {
    Logger.log("Admin email error: " + e);
  }
}

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
═══════════════════════════════════════════════════════════ */

function _tableRow(label, value, isLast, padding, labelWidth) {
  var border = isLast ? '' : 'border-bottom:1px solid #e8ecf2;';
  return '<tr>' +
    '<td style="padding:' + padding + ' 0;' + border + 'width:' + labelWidth + ';font-size:13px;color:#4a5568;">' + label + '</td>' +
    '<td style="padding:' + padding + ' 0;' + border + 'font-size:14px;color:#0f1e35;font-weight:600;text-align:right;">' + value + '</td>' +
    '</tr>';
}

function detailRow(label, value, isLast) { return _tableRow(label, value, isLast, '14px', '45%'); }
function adminRow(label, value, isLast) { return _tableRow(label, value, isLast, '13px', '40%'); }

function getGuestHtmlTemplate(data, t, endTime) {
  var greeting = t.greeting.replace("{name}", data.name || "there");
  var tourName = data.tourTitle || getTourDisplayName(data.tour || "");
  var extras = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);
  var timeDisplay = (data.time || '—') + (endTime ? ' - ' + endTime : '');

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">EXPERIENCE &nbsp;·&nbsp; COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;margin-bottom:16px;border-top:3px solid #e8834a;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">' + greeting + '</p>' +
    '<p style="margin:0 0 20px;font-size:15px;color:#0f1e35;font-weight:600;">' + t.confirmed + '</p>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.7;">' + t.subheading + '</p>' +
    '</td></tr>' +

    '<tr><td style="height:12px;"></td></tr>' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:0;overflow:hidden;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:20px 28px;">' +
    '<div style="font-size:10px;letter-spacing:3px;color:#e8834a;font-weight:700;margin-bottom:8px;">YOUR EXPERIENCE</div>' +
    '<div style="font-size:18px;color:#ffffff;font-weight:600;">' + tourName + '</div>' +
    '<div translate="no" style="margin-top:6px;font-size:12px;color:#718096;">Seaduced Experience · Copenhagen</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px;">' +
    detailRow(t.date, data.date || '—') +
    detailRow(t.time, timeDisplay) +
    detailRow(t.passengers, (data.qty || '—') + ' person(s)') +
    detailRow(t.language, langLabel) +
    detailRow(t.extras, extras) +
    detailRow(t.amount, '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
    detailRow(t.refNumber, '<span style="color:#e8834a;">' + refNumber + '</span>', true) +
    '</table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#f5f6f8;border-top:1px solid #e8ecf2;padding:16px 28px;">' +
    '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">MEETING POINT</div>' +
    '<div style="font-size:13px;color:#0f1e35;font-weight:600;">' + t.locationVal + '</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="padding:24px 28px;text-align:center;">' +
    '<a href="https://maps.app.goo.gl/e3TSNU4U5oaWVeNq8" ' +
    'style="display:inline-block;background-color:#e8834a;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">' +
    t.mapButton.toUpperCase() +
    '</a>' +
    '</td>' +
    '</tr></table>' +

    '</td></tr>' +

    getRulesBlock(data.lang || 'english') +

    '<tr><td style="height:12px;"></td></tr>' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:24px 28px;">' +
    '<p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f1e35;">' + t.helpTitle + '</p>' +
    '<p style="margin:0 0 10px;font-size:13px;color:#4a5568;line-height:1.7;">' + t.helpBody + '</p>' +
    '<p style="margin:0;">' +
    '<a href="tel:+4522561882" style="font-size:14px;color:#e8834a;font-weight:700;text-decoration:none;">+45 22 56 18 82</a>' +
    '</p>' +
    '</td></tr>' +

    '<tr><td style="padding:32px 0 16px;text-align:center;">' +
    '<p style="margin:0 0 4px;font-size:14px;color:#718096;font-style:italic;">' + t.tagline + '</p>' +
    '<p translate="no" style="margin:8px 0 0;font-size:11px;letter-spacing:1px;color:#a0aec0;">' + t.footer + '</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '</body></html>';
}

function getRulesBlock(lang) {
  var content = {
    english: {
      welcome: "Welcome aboard Seaduced Experience",
      rulesHeading: "BEFORE WE DEPART",
      rulesIntro: "It's important to know that:",
      rules: [
        "Bringing your own food or drinks isn't allowed.",
        "If your package includes food and drinks, they'll be served on board.",
        "If not included, drinks can be purchased on the boat — food can be pre‑ordered 48 hours in advance.",
        "Dogs and smoking are not allowed on board."
      ]
    },
    spanish: {
      welcome: "Bienvenido a bordo de Seaduced Experience",
      rulesHeading: "ANTES DE PARTIR",
      rulesIntro: "Es importante que sepas que:",
      rules: [
        "No está permitido traer comida ni bebida propia.",
        "Si tu paquete incluye comida y bebida, serán servidos a bordo.",
        "Si no están incluidos, puedes comprar bebidas en el barco — la comida puede pedirse con 48 h de antelación.",
        "No se permiten perros ni fumar a bordo."
      ]
    },
    danish: {
      welcome: "Velkommen om bord hos Seaduced Experience",
      rulesHeading: "INDEN VI AFSEJLER",
      rulesIntro: "Det er vigtigt at vide:",
      rules: [
        "Det er ikke tilladt at medbringe egen mad eller drikkevarer.",
        "Hvis din pakke inkluderer mad og drikkevarer, serveres de om bord.",
        "Hvis ikke inkluderet, kan drikkevarer købes på båden — mad kan forudbestilles 48 timer i forvejen.",
        "Hunde og rygning er ikke tilladt om bord."
      ]
    }
  };

  var c = content[lang] || content.english;

  var rulesHtml = c.rules.map(function (item, i) {
    var isLast = i === c.rules.length - 1;
    return '<tr><td style="padding:10px 0;' + (isLast ? '' : 'border-bottom:1px solid #f0f2f5;') + '">' +
      '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="width:18px;vertical-align:top;">' +
      '<div style="width:6px;height:6px;background:#e8834a;border-radius:50%;margin-top:5px;"></div>' +
      '</td>' +
      '<td style="font-size:13px;color:#4a5568;line-height:1.65;">' + item + '</td>' +
      '</tr></table></td></tr>';
  }).join('');

  return '<tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="background:#ffffff;border-radius:12px;overflow:hidden;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background:#0f1e35;padding:20px 28px;">' +
    '<div style="font-size:16px;color:#ffffff;font-weight:700;">' + c.welcome + '</div>' +
    '</td></tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="padding:16px 28px 4px;">' +
    '<div style="font-size:10px;letter-spacing:3px;color:#e8834a;font-weight:700;margin-bottom:6px;">' + c.rulesHeading + '</div>' +
    '<p style="margin:0 0 8px;font-size:13px;color:#4a5568;">' + c.rulesIntro + '</p>' +
    '</td></tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px 16px;">' +
    rulesHtml +
    '</table>' +

    '</td></tr>';
}

function getAdminHtmlTemplate(data, t, endTime) {
  var tourName = data.tourTitle || getTourDisplayName(data.tour || "");
  var extras = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var isGYG = data.source === 'GetYourGuide';
  var refLabel = isGYG ? 'Referencia GYG' : 'Referencia SumUp';
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);
  var timeDisplay = (data.time || '—') + (endTime ? ' - ' + endTime : '');

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:24px 32px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td>' +
    '<div translate="no" style="font-size:13px;letter-spacing:4px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:3px;color:#e8834a;margin-top:4px;">BOOKING SYSTEM</div>' +
    '</td>' +
    '<td style="text-align:right;">' +
    (isGYG ?
      '<div style="display:inline-block;background-color:#4a2e0f;border:1px solid #e8834a;border-radius:4px;padding:6px 14px;margin-right:6px;">' +
      '<span style="font-size:11px;color:#e8834a;font-weight:700;letter-spacing:1px;">GETYOURGUIDE</span>' +
      '</div>'
      : '') +
    '<div style="display:inline-block;background-color:#1c3a1a;border:1px solid #2d5a1b;border-radius:4px;padding:6px 14px;">' +
    '<span style="font-size:11px;color:#5aaa3a;font-weight:700;letter-spacing:1px;">PAID</span>' +
    '</div>' +
    '</td>' +
    '</tr></table>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 16px 40px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px 12px 0 0;padding:28px 32px 20px;border-bottom:3px solid #e8834a;">' +
    (isGYG ?
      '<p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#e8834a;font-weight:700;">RESERVA RECIBIDA DESDE GETYOURGUIDE</p>'
      : '') +
    '<p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0f1e35;">Nueva reserva recibida</p>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;">' + tourName + ' &nbsp;·&nbsp; ' + (data.date || '') + ' &nbsp;·&nbsp; ' + timeDisplay + '</p>' +
    '</td></tr>' +

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

    '<tr><td style="background:#ffffff;padding:8px 32px;border-left:1px solid #e8ecf2;border-right:1px solid #e8ecf2;">' +
    '<p style="font-size:10px;letter-spacing:2px;color:#e8834a;font-weight:700;margin:20px 0 4px;">DATOS DE LA RESERVA</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
    adminRow('Importe', '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
    adminRow(refLabel, '<span style="color:#e8834a;">' + refNumber + '</span>') +
    adminRow('Experiencia', tourName) +
    adminRow('Fecha', data.date || '—') +
    adminRow('Hora', timeDisplay) +
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

    '<tr><td style="background-color:#0f1e35;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">' +
    '<p translate="no" style="margin:0;font-size:10px;letter-spacing:2px;color:#4a6080;">SEADUCED EXPERIENCE &nbsp;·&nbsp; PANEL INTERNO</p>' +
    '</td></tr>' +

    '</table>' +
    '</td></tr></table>' +

    '</body></html>';
}

/* ═══════════════════════════════════════════════════════════
   TESTS
═══════════════════════════════════════════════════════════ */

function testCalendar() {
  var cal1 = CalendarApp.getCalendarById(CALENDAR_IDS.boat1);
  var cal2 = CalendarApp.getCalendarById(CALENDAR_IDS.boat2);
  Logger.log("Calendario 1: " + (cal1 ? cal1.getName() : "NULL (No encontrado)"));
  Logger.log("Calendario 2: " + (cal2 ? cal2.getName() : "NULL (No encontrado)"));
}

function testEmail() {
  var data = {
    name: "Nick",
    email: "nicolasllanossw@gmail.com",
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
