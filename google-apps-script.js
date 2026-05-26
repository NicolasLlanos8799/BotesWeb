/**
 * Google Apps Script — Seaduced Experience
 * Booking creation, calendar management & premium email confirmations
 */

/* ═══════════════════════════════════════════════════════════
   TEST FUNCTION — run this from the editor to authorize Gmail
═══════════════════════════════════════════════════════════ */
function testCalendar() {
  var cal1 = CalendarApp.getCalendarById('ad4644278f9ee9075ebb8a8bb0c8eca457cdc3fe908bd4b1eb7cd3b5f751ca71@group.calendar.google.com');
  var cal2 = CalendarApp.getCalendarById('2772126ed76f0380789fb1af0e56d9e55313cc013cfc55f6e4f3b12b7cc35e72@group.calendar.google.com');
  Logger.log("Calendario 1: " + (cal1 ? cal1.getName() : "NULL (No encontrado)"));
  Logger.log("Calendario 2: " + (cal2 ? cal2.getName() : "NULL (No encontrado)"));
}

function testEmail() {
  var data = {
    name:               "Nick",
    email:              "nicolasllanossw@gmail.com",
    phone:              "+45 123 312",
    tour:               "Copenhagen City Highlights",
    date:               "2026-05-26",
    time:               "10:00",
    qty:                "2",
    lang:               "english",
    tapas:              "2",
    sumup_checkout_id:  "TEST-001"
  };
  var t     = getTranslations("english");
  var start = new Date(2026, 4, 26, 10, 0);
  var end   = new Date(2026, 4, 26, 11, 0);
  sendBookingEmails(data, t, start, end);
}

/* ═══════════════════════════════════════════════════════════
   HTTP HANDLERS
═══════════════════════════════════════════════════════════ */
function doGet(e) {
  var action = e.parameter.action;
  if (action === 'getAvailability')
    return handleGetAvailability(e.parameter.calendar, e.parameter.date);
  if (action === 'getMonthlyAvailability') {
    var month = e.parameter.month;
    var year  = e.parameter.year;
    if (!month && e.parameter.date) {
      var parts = e.parameter.date.split('-');
      year  = parts[0];
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
    var data   = JSON.parse(e.postData.contents);
    var action = data.action;
    Logger.log("ACTION: " + action);
    Logger.log("DATA: "   + JSON.stringify(data));
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
function getCalendar(name) {
  var map = {
    'boat1': 'ad4644278f9ee9075ebb8a8bb0c8eca457cdc3fe908bd4b1eb7cd3b5f751ca71@group.calendar.google.com',
    'boat2': '2772126ed76f0380789fb1af0e56d9e55313cc013cfc55f6e4f3b12b7cc35e72@group.calendar.google.com'
  };
  return CalendarApp.getCalendarById(map[name] || map['boat1']);
}

function handleGetAvailability(calendarName, dateStr) {
  var calendar  = getCalendar(calendarName);
  var day       = new Date(dateStr);
  var startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8,  0, 0);
  var endOfDay   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21, 0, 0);
  var busySlots  = [];
  calendar.getEvents(startOfDay, endOfDay).forEach(function(e) {
    var startH = e.getStartTime().getHours();
    var endH = e.getEndTime().getHours();
    for (var h = startH; h < endH; h++) {
      busySlots.push({ time: ("0" + h).slice(-2) + ":00", available: false });
    }
  });
  return ContentService.createTextOutput(JSON.stringify({ busy: busySlots }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleGetMonthlyAvailability(calendarName, month, year) {
  var calendar     = getCalendar(calendarName);
  var startOfMonth = new Date(year, month - 1, 1);
  var endOfMonth   = new Date(year, month, 0, 23, 59, 59);
  var daysData     = {};
  
  calendar.getEvents(startOfMonth, endOfMonth).forEach(function(e) {
    var start = e.getStartTime();
    var dStr = start.getFullYear() + "-" + ("0" + (start.getMonth() + 1)).slice(-2) + "-" + ("0" + start.getDate()).slice(-2);
    if (!daysData[dStr]) daysData[dStr] = [];
    
    var startH = start.getHours();
    var endH = e.getEndTime().getHours();
    for (var h = startH; h < endH; h++) {
      daysData[dStr].push({ time: ("0" + h).slice(-2) + ":00", available: false });
    }
  });

  return ContentService.createTextOutput(JSON.stringify(daysData))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleListAllBookings(startStr, endStr) {
  var start     = startStr ? new Date(startStr) : new Date(new Date().getFullYear(), 0,  1);
  var end       = endStr   ? new Date(endStr)   : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);
  var calendars = [
    { id: 'boat1', cal: getCalendar('boat1') },
    { id: 'boat2', cal: getCalendar('boat2') }
  ];
  var allEvents = [];
  calendars.forEach(function(c) {
    if (!c.cal) return;
    c.cal.getEvents(start, end).forEach(function(e) {
      allEvents.push({
        id: e.getId(), calendar: c.id, title: e.getTitle(),
        description: e.getDescription(),
        start: e.getStartTime().toISOString(),
        end:   e.getEndTime().toISOString(),
        color: e.getColor()
      });
    });
  });
  return ContentService.createTextOutput(JSON.stringify({ events: allEvents }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ═══════════════════════════════════════════════════════════
   BOOKING CREATION
═══════════════════════════════════════════════════════════ */
function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar || 'boat1');

  // Deduplication
  if (data.sumup_checkout_id && data.sumup_checkout_id !== 'N/A') {
    var existing = findEventBySumUpId(data.sumup_checkout_id);
    if (existing) {
      Logger.log("Duplicate (SumUp ID: " + data.sumup_checkout_id + "). Skipping.");
      return { success: true, message: "Duplicate avoided", eventId: existing.getId() };
    }
  }

  // Duration
  var durationH = 1;
  var tour = data.tour || data.tourTitle || "";
  if (tour.includes('1-Hour') || tour.includes('Highlights') || tour.includes('book-1h')) durationH = 1;
  if (tour.includes('Floating Wine')) durationH = 2;
  if (tour.includes('3-Hour'))        durationH = 3;
  if (tour.includes('4-Hour'))        durationH = 4;
  if (tour.includes('Malmö'))         durationH = 7;

  var dateParts = data.date.split('-');
  var timeParts = data.time.split(':');
  var start = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0], timeParts[1]);
  var end   = new Date(start.getTime() + durationH * 3600000);

  // Calendar event
  var status      = data.payment_status || 'PAID';
  var description =
    "✨ " + tour.toUpperCase() + "\n" +
    "📅 " + data.date + " | 🕒 " + (data.time || "N/A") + "\n" +
    "👥 Passengers: " + (data.qty  || "N/A") + "\n" +
    "🌍 Language: "   + (data.lang || "N/A") + "\n" +
    "🍷 Extras: " + (data.tapas && data.tapas != "0" ? data.tapas + " Tapas/Charcuterie" : "None") + "\n\n" +
    "👤 CONTACT\n" +
    "Name: "  + (data.name  || "N/A") + "\n" +
    "Email: " + (data.email || "N/A") + "\n" +
    "Phone: " + (data.phone || "N/A") + "\n" +
    "──────────────────────────\n" +
    "SumUp ID: " + (data.sumup_checkout_id || "N/A") + "\n" +
    "Amount: "  + (data.amount ? data.amount + " " + (data.currency || "") : "N/A") + "\n" +
    "Status: "  + status;

  var event = calendar.createEvent("Reserva: " + (data.name || 'Cliente'), start, end, { description: description });
  event.setColor(CalendarApp.EventColor.YELLOW);

  var lang = data.lang || 'english';
  var t    = getTranslations(lang);

  if (status === 'PAID' || status === 'paid') {
    if (data.email) {
      try { event.addGuest(data.email); } catch (e) { Logger.log("Guest error: " + e); }
    }
    try {
      sendBookingEmails(data, t, start, end);
    } catch (e) {
      event.setDescription(description + "\n\n[EMAIL ERROR]: " + e.toString());
    }
  }

  return { success: true, eventId: event.getId(), status: status };
}

function findEventBySumUpId(sumupId) {
  var calendars = [getCalendar('boat1'), getCalendar('boat2')].filter(function(c) { return c !== null; });
  var now    = new Date();
  var future = new Date();
  future.setMonth(now.getMonth() + 12);
  for (var i = 0; i < calendars.length; i++) {
    try {
      var events = calendars[i].getEvents(now, future);
      for (var j = 0; j < events.length; j++) {
        var desc = events[j].getDescription();
        if (desc && desc.indexOf("SumUp ID: " + sumupId) !== -1) return events[j];
      }
    } catch(e) {
      Logger.log("Error accessing calendar " + i + ": " + e.toString());
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
      subject:     "Your booking is confirmed!",
      greeting:    "Hi {name},",
      confirmed:   "Your booking is confirmed",
      subheading:  "We can't wait to welcome you on board. Here are your booking details:",
      refNumber:   "Reference",
      tour:        "Experience",
      date:        "Date",
      time:        "Departure",
      passengers:  "Passengers",
      language:    "Language",
      extras:      "Extras",
      amount:      "Amount paid",
      location:    "Meeting point",
      locationVal: "Havnegade 1, 1058 København",
      mapButton:   "Get directions",
      helpTitle:   "Need help?",
      helpBody:    "Contact us via WhatsApp or reply to this email — we're always happy to help.",
      tagline:     "See you on the water.",
      footer:      "© Seaduced Experience · Copenhagen, Denmark"
    },
    spanish: {
      subject:     "¡Tu reserva está confirmada!",
      greeting:    "Hola {name},",
      confirmed:   "Tu reserva está confirmada",
      subheading:  "Estamos deseando darte la bienvenida a bordo. Aquí tienes los detalles de tu reserva:",
      refNumber:   "Referencia",
      tour:        "Experiencia",
      date:        "Fecha",
      time:        "Salida",
      passengers:  "Pasajeros",
      language:    "Idioma",
      extras:      "Extras",
      amount:      "Importe pagado",
      location:    "Punto de encuentro",
      locationVal: "Havnegade 1, 1058 København",
      mapButton:   "Cómo llegar",
      helpTitle:   "¿Necesitas ayuda?",
      helpBody:    "Contáctanos por WhatsApp o respondiendo este email — estamos aquí para ayudarte.",
      tagline:     "Nos vemos en el agua.",
      footer:      "© Seaduced Experience · Copenhague, Dinamarca"
    },
    danish: {
      subject:     "Din booking er bekræftet!",
      greeting:    "Hej {name},",
      confirmed:   "Din booking er bekræftet",
      subheading:  "Vi glæder os til at byde dig velkommen om bord. Her er dine bookingdetaljer:",
      refNumber:   "Reference",
      tour:        "Oplevelse",
      date:        "Dato",
      time:        "Afgang",
      passengers:  "Passagerer",
      language:    "Sprog",
      extras:      "Extras",
      amount:      "Betalt beløb",
      location:    "Mødested",
      locationVal: "Havnegade 1, 1058 København",
      mapButton:   "Se rutevejledning",
      helpTitle:   "Brug for hjælp?",
      helpBody:    "Kontakt os via WhatsApp eller svar på denne e-mail — vi hjælper altid gerne.",
      tagline:     "Vi ses på vandet.",
      footer:      "© Seaduced Experience · København, Danmark"
    }
  };
  return map[lang] || map.english;
}

/* ═══════════════════════════════════════════════════════════
   EMAIL DISPATCHER
═══════════════════════════════════════════════════════════ */
function sendBookingEmails(data, t, start, end) {
  var guestHtml = getGuestHtmlTemplate(data, t);
  var adminHtml = getAdminHtmlTemplate(data, t);
  var icsBlob   = createIcsBlob(
    "Seaduced Experience: " + (data.tour || data.tourTitle),
    start, end, t.locationVal
  );

  if (data.email) {
    GmailApp.sendEmail(data.email, "Seaduced Experience — " + t.subject, "", {
      name:        "Seaduced Experience",
      htmlBody:    guestHtml,
      attachments: [icsBlob]
    });
  }

  var adminEmail = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(
    adminEmail,
    "⚓ Nueva Reserva — " + (data.tour || data.tourTitle) + " · " + (data.name || "") + " · " + (data.date || ""),
    "",
    { name: "Seaduced Bookings", htmlBody: adminHtml }
  );
}

function createIcsBlob(title, start, end, location) {
  var ics =
    "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n" +
    "DTSTART:" + Utilities.formatDate(start, "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
    "DTEND:"   + Utilities.formatDate(end,   "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
    "SUMMARY:" + title + "\n" +
    "LOCATION:" + location + "\n" +
    "END:VEVENT\nEND:VCALENDAR";
  return Utilities.newBlob(ics, "text/calendar", "seaduced-booking.ics");
}

/* ═══════════════════════════════════════════════════════════
   SHARED HELPERS
   Colors: navy #0f1e35 | orange #e8834a | text #4a5568
═══════════════════════════════════════════════════════════ */
function detailRow(label, value, isLast) {
  var border = isLast ? '' : 'border-bottom:1px solid #e8ecf2;';
  return (
    '<tr>' +
      '<td style="padding:14px 0;' + border + 'width:45%;font-size:13px;color:#4a5568;">' + label + '</td>' +
      '<td style="padding:14px 0;' + border + 'font-size:14px;color:#0f1e35;font-weight:600;text-align:right;">' + value + '</td>' +
    '</tr>'
  );
}

function adminRow(label, value, isLast) {
  var border = isLast ? '' : 'border-bottom:1px solid #e8ecf2;';
  return (
    '<tr>' +
      '<td style="padding:13px 0;' + border + 'width:40%;font-size:13px;color:#4a5568;">' + label + '</td>' +
      '<td style="padding:13px 0;' + border + 'font-size:14px;color:#0f1e35;font-weight:600;text-align:right;">' + value + '</td>' +
    '</tr>'
  );
}

/* ═══════════════════════════════════════════════════════════
   GUEST EMAIL
═══════════════════════════════════════════════════════════ */
function getGuestHtmlTemplate(data, t) {
  var greeting  = t.greeting.replace("{name}", data.name || "there");
  var tourName  = data.tour || data.tourTitle || "—";
  var extras    = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel     = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);

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
    '<div style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
    '<div style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">EXPERIENCE &nbsp;·&nbsp; COPENHAGEN</div>' +
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
        '<div style="margin-top:6px;font-size:12px;color:#718096;">Seaduced Experience · Copenhagen</div>' +
      '</td>' +
    '</tr></table>' +

    /* Detail rows */
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px;">' +
      detailRow(t.date,       data.date || '—') +
      detailRow(t.time,       data.time || '—') +
      detailRow(t.passengers, (data.qty || '—') + ' person(s)') +
      detailRow(t.language,   langLabel) +
      detailRow(t.extras,     extras) +
      detailRow(t.amount,     '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
      detailRow(t.refNumber,  '<span style="color:#e8834a;">' + refNumber + '</span>', true) +
    '</table>' +

    /* Meeting point strip */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background-color:#f5f6f8;border-top:1px solid #e8ecf2;padding:16px 28px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">MEETING POINT</div>' +
        '<div style="font-size:13px;color:#0f1e35;font-weight:600;">' + t.locationVal + '</div>' +
      '</td>' +
    '</tr></table>' +

    /* CTA */
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="padding:24px 28px;text-align:center;">' +
        '<a href="https://www.google.com/maps/search/?api=1&query=Havnegade+1+1058+Kobenhavn" ' +
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
    '<p style="margin:8px 0 0;font-size:11px;letter-spacing:1px;color:#a0aec0;">' + t.footer + '</p>' +
  '</td></tr>' +

'</table>' +
'</td></tr></table>' +

/* ── Navy bottom bar ── */
'<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
  '<td style="background-color:#0f1e35;height:4px;font-size:0;">&nbsp;</td>' +
'</tr></table>' +

'</body></html>';
}

/* ═══════════════════════════════════════════════════════════
   ADMIN EMAIL
═══════════════════════════════════════════════════════════ */
function getAdminHtmlTemplate(data, t) {
  var tourName  = data.tour || data.tourTitle || "—";
  var extras    = (data.tapas && data.tapas != "0") ? data.tapas + " Tapas / Charcuterie" : "—";
  var refNumber = data.sumup_checkout_id || "—";
  var langLabel = (data.lang || "english");
  langLabel     = langLabel.charAt(0).toUpperCase() + langLabel.slice(1);

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
        '<div style="font-size:13px;letter-spacing:4px;color:#ffffff;font-weight:700;">SEADUCED</div>' +
        '<div style="font-size:9px;letter-spacing:3px;color:#e8834a;margin-top:4px;">BOOKING SYSTEM</div>' +
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
        '<div style="font-size:22px;font-weight:700;color:#0f1e35;">' + langLabel.substring(0,2).toUpperCase() + '</div>' +
      '</td>' +
      '<td style="width:1px;background:#e8ecf2;">&nbsp;</td>' +
      '<td style="text-align:center;padding:8px;">' +
        '<div style="font-size:10px;letter-spacing:2px;color:#718096;margin-bottom:4px;">EXTRAS</div>' +
        '<div style="font-size:22px;font-weight:700;color:#0f1e35;">' + ((data.tapas && data.tapas != "0") ? data.tapas : '0') + '</div>' +
      '</td>' +
    '</tr></table>' +
  '</td></tr>' +

  /* ── Details ── */
  '<tr><td style="background:#ffffff;padding:8px 32px;border-left:1px solid #e8ecf2;border-right:1px solid #e8ecf2;">' +
    '<p style="font-size:10px;letter-spacing:2px;color:#e8834a;font-weight:700;margin:20px 0 4px;">DATOS DE LA RESERVA</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
      adminRow('Importe', '<span style="font-size:16px;font-weight:700;color:#0f1e35;">' + (data.amount ? data.amount + ' ' + (data.currency || 'DKK') : '—') + '</span>') +
      adminRow('Referencia SumUp', '<span style="color:#e8834a;">' + refNumber + '</span>') +
      adminRow('Experiencia', tourName) +
      adminRow('Fecha', data.date || '—') +
      adminRow('Hora',  data.time || '—') +
      adminRow('Extras', extras, true) +
    '</table>' +
    '<p style="font-size:10px;letter-spacing:2px;color:#e8834a;font-weight:700;margin:24px 0 4px;">DATOS DEL CLIENTE</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0">' +
      adminRow('Nombre',   data.name  || '—') +
      adminRow('Email',    data.email || '—') +
      adminRow('Telefono', data.phone || '—', true) +
    '</table>' +
    '<div style="height:20px;"></div>' +
  '</td></tr>' +

  /* ── Footer strip ── */
  '<tr><td style="background-color:#0f1e35;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">' +
    '<p style="margin:0;font-size:10px;letter-spacing:2px;color:#4a6080;">SEADUCED EXPERIENCE &nbsp;·&nbsp; PANEL INTERNO</p>' +
  '</td></tr>' +

'</table>' +
'</td></tr></table>' +

'</body></html>';
}
