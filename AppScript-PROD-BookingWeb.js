/**
 * Google Apps Script — Seaduced Experience
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
   CONFIGURATION
═══════════════════════════════════════════════════════════ */

var CALENDAR_IDS = {
  boat1: '478b8158512db83e1d3083ee1eafb31255589a8636a34944aeff9f38d10787f2@group.calendar.google.com',
  boat2: '3bcf707af9af431820c23c5f7684b5f6929ab45fbdd2d2a858783cce5ce9e820@group.calendar.google.com'
};

/* ═══════════════════════════════════════════════════════════
   HTTP HANDLERS
═══════════════════════════════════════════════════════════ */

function doGet(e) {
  var action = e.parameter.action;

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
      : action === 'createHoldEvent'
      ? handleCreateHoldEvent(data)
      : action === 'confirmHoldEvent'
      ? handleConfirmHoldEvent(data)
      : action === 'deleteHoldEvent'
      ? handleDeleteHoldEvent(data)
      : action === 'sendOtp'
      ? handleSendOtp(data)
      : action === 'resendEmail'
      ? handleResendEmail(data)
      : action === 'paymentFailed'
      ? handlePaymentFailed(data)
      : action === 'paymentReminder'
      ? handlePaymentReminder(data)
      : action === 'sendCancellationEmail'
      ? handleSendCancellationEmail(data)
      : action === 'updateEvent'
      ? handleUpdateEvent(data)
      : action === 'deleteEvent'
      ? handleDeleteEvent(data)
      : action === 'createBlockEvent'
      ? handleCreateBlockEvent(data)
      : action === 'deleteBlockEvent'
      ? handleDeleteBlockEvent(data)
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
    'city-highlights-1h':  'City Highlights',
    'book-1h-2h':          'City Highlights (2 Hours)',
    'book-10p':            'City Highlights (10 Guests)',
    'book-10p-2h':         'City Highlights (10 Guests) (2 Hours)',
    'book-wine':           'Floating Wine Tasting Experience',
    'city-highlights-4h':  'Sea Fortress and Coastal Journey (4-Hour)',
    'city-highlights-3h':  'Private 3-Hour Extended (Reffen)',
    'book-malmo':          'Copenhagen to Malmö Experience',
    'book-land':           'Copenhagen Private Boat y Land Experience',
    'book-danish-breakfast': 'City Highlights with Danish Breakfast'
  };
  return names[tourCode] || tourCode;
}

function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar || 'boat1');

  // Use LockService to prevent race condition: webhook + fallback both arrive simultaneously
  // Lock covers the check-then-create window so only one execution creates the event
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000); // wait up to 12s
  } catch (e) {
    Logger.log("Could not acquire lock for: " + (data.sumup_checkout_id || 'unknown'));
    return { success: false, message: "Lock timeout" };
  }

  try {
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
  } finally {
    lock.releaseLock();
  }
}

function findEventBySumUpId(sumupId) {
  return findEventByDescriptionFragment("SumUp ID: " + sumupId);
}

/* ═══════════════════════════════════════════════════════════
   GYG API — HOLD / CONFIRM / DELETE CALENDAR EVENTS
   Called from gyg-handler.js (Vercel) on /reserve/, /book/,
   /cancel-reservation/ and /cancel-booking/
═══════════════════════════════════════════════════════════ */

/**
 * /reserve/ → create a grey "HOLD" event so the slot is blocked on the web immediately.
 * data: { gyg_booking_id, tour, calendar, date, time, qty }
 */
function handleCreateHoldEvent(data) {
  if (!data.gyg_booking_id || !data.date || !data.time) {
    return { success: false, error: "Missing gyg_booking_id, date or time" };
  }

  // Serialize with lock to avoid race condition with confirmHoldEvent
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    // Also catches the case where confirmHoldEvent ran first
    var existing = findEventByDescriptionFragment("GYG Ref: " + data.gyg_booking_id);

    // Already confirmed (CYAN) — an amendment must not downgrade it back to HOLD
    if (existing && existing.getColor() === CalendarApp.EventColor.CYAN) {
      return { success: true, message: "Event already confirmed", eventId: existing.getId() };
    }

    var calendar = getCalendar(data.calendar || 'boat1');
    var tour = data.tour || '';
    var range = buildStartEnd(data.date, data.time, getTourDurationHours(tour, 1));

    var description =
      "⏳ GYG HOLD — pending confirmation\n" +
      "📅 " + data.date + " | 🕒 " + data.time + "\n" +
      "👥 Passengers: " + (data.qty || "N/A") + "\n" +
      "──────────────────────────\n" +
      "GYG Ref: " + data.gyg_booking_id + "\n" +
      "Source: GetYourGuide (hold)";

    var title = "⏳ GYG HOLD: " + (data.qty || '') + "p";

    // Amendment: GYG reuses the same reference with new date/pax — update in place
    if (existing) {
      existing.setTitle(title);
      existing.setDescription(description);
      existing.setTime(range.start, range.end);
      existing.setColor(CalendarApp.EventColor.GRAY);
      Logger.log("GYG hold event updated: " + data.gyg_booking_id + " | " + existing.getId());
      return { success: true, eventId: existing.getId(), action: "updated" };
    }

    var event = calendar.createEvent(title, range.start, range.end, { description: description });
    event.setColor(CalendarApp.EventColor.GRAY);

    Logger.log("GYG hold event created: " + data.gyg_booking_id + " | " + event.getId());
    return { success: true, eventId: event.getId() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * /book/ → upgrade the grey HOLD to a confirmed CYAN event with full customer details.
 * data: { gyg_booking_id, tour, calendar, date, time, qty, name, email, phone, lang }
 */
function handleConfirmHoldEvent(data) {
  if (!data.gyg_booking_id) {
    return { success: false, error: "Missing gyg_booking_id" };
  }

  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
  var existing = findEventByDescriptionFragment("GYG Ref: " + data.gyg_booking_id);

  var calendar = getCalendar(data.calendar || 'boat1');
  var tour = data.tour || '';
  var range = buildStartEnd(data.date, data.time, getTourDurationHours(tour, 1));
  var endTime = ('0' + range.end.getHours()).slice(-2) + ':' + ('0' + range.end.getMinutes()).slice(-2);

  var description =
    "✨ " + getTourDisplayName(tour) + "\n" +
    "📅 " + data.date + " | 🕒 " + data.time + " - " + endTime + "\n" +
    "👥 Passengers: " + (data.qty || "N/A") + "\n" +
    "🌍 Language: " + (data.lang || "N/A") + "\n\n" +
    "👤 CONTACT\n" +
    "Name: " + (data.name || "N/A") + "\n" +
    "Email: " + (data.email || "N/A") + "\n" +
    "Phone: " + (data.phone || "N/A") + "\n" +
    "──────────────────────────\n" +
    "GYG Ref: " + data.gyg_booking_id + "\n" +
    "Source: GetYourGuide";

  var title = "GYG: " + (data.name || 'Guest') + " " + (data.qty || '') + "p";

  if (existing) {
    // Update in place
    existing.setTitle(title);
    existing.setDescription(description);
    existing.setTime(range.start, range.end);
    existing.setColor(CalendarApp.EventColor.CYAN);
    Logger.log("GYG hold confirmed (updated): " + data.gyg_booking_id);
    notifyAdminGYGBooking(data, tour, range, endTime);
    return { success: true, eventId: existing.getId(), action: "updated" };
  }

  // Hold event not found — create confirmed event directly
  var event = calendar.createEvent(title, range.start, range.end, { description: description });
  event.setColor(CalendarApp.EventColor.CYAN);
  Logger.log("GYG confirmed event created (no prior hold): " + data.gyg_booking_id);
  notifyAdminGYGBooking(data, tour, range, endTime);
  return { success: true, eventId: event.getId(), action: "created" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sends the admin notification email for a confirmed GYG booking.
 * GYG already emails the customer directly — this is admin-only, so we
 * never fail the confirmation flow if the email itself errors out.
 */
function notifyAdminGYGBooking(data, tour, range, endTime) {
  try {
    var adminEmail = "seaducedexperience@gmail.com";
    GmailApp.sendEmail(
      adminEmail,
      "⚓ GYG Reserva confirmada — " + getTourDisplayName(tour) + " · " + (data.name || "") + " · " + (data.date || ""),
      "",
      {
        name: "Seaduced Bookings",
        htmlBody: getAdminHtmlTemplate(
          { ...data, sumup_checkout_id: data.gyg_booking_id },
          getTranslations(data.lang || 'english'),
          endTime
        )
      }
    );
    Logger.log("GYG confirm email sent to admin for: " + data.gyg_booking_id);
  } catch (e) {
    Logger.log("GYG confirm email error (non-fatal): " + e.toString());
  }
}

/**
 * /cancel-reservation/ and /cancel-booking/ → delete the calendar event.
 * data: { gyg_booking_id }
 */
function handleDeleteHoldEvent(data) {
  if (!data.gyg_booking_id) {
    return { success: false, error: "Missing gyg_booking_id" };
  }

  var existing = findEventByDescriptionFragment("GYG Ref: " + data.gyg_booking_id);
  if (!existing) {
    Logger.log("GYG deleteHoldEvent: no event found for " + data.gyg_booking_id);
    return { success: true, message: "No event found to delete" };
  }

  existing.deleteEvent();
  Logger.log("GYG event deleted: " + data.gyg_booking_id);
  return { success: true, message: "Event deleted" };
}

/* ═══════════════════════════════════════════════════════════
   BLOQUEOS MANUALES DE HORARIO
   El evento en el calendario del bote es lo que hace que la web
   pública deje de ofrecer esas horas (la disponibilidad ahora se
   lee de Postgres, ver api/availability.js, pero se sincroniza
   con este calendario igual).
═══════════════════════════════════════════════════════════ */

/**
 * data: { calendar: 'boat1'|'boat2', date, startTime 'HH:MM', endTime 'HH:MM', reason, group_id }
 */
function handleCreateBlockEvent(data) {
  if (!data.date || !data.startTime || !data.endTime || !data.group_id) {
    return { success: false, error: "Missing date, startTime, endTime or group_id" };
  }

  var calendar = getCalendar(data.calendar || 'boat1');
  var dp = data.date.split('-');
  var sp = data.startTime.split(':');
  var ep = data.endTime.split(':');
  var start = new Date(+dp[0], +dp[1] - 1, +dp[2], +sp[0], +sp[1]);
  var end = new Date(+dp[0], +dp[1] - 1, +dp[2], +ep[0], +ep[1]);
  if (!(end > start)) return { success: false, error: "endTime must be after startTime" };

  var description =
    "⛔ HORARIO BLOQUEADO\n" +
    "📅 " + data.date + " | 🕒 " + data.startTime + " - " + data.endTime + "\n" +
    "⛵ " + (data.calendar || 'boat1') + "\n" +
    (data.reason ? "📝 " + data.reason + "\n" : "") +
    "──────────────────────────\n" +
    "BLOCK_GROUP: " + data.group_id + "\n" +
    "Source: Admin Panel";

  var event = calendar.createEvent(
    "⛔ BLOQUEADO" + (data.reason ? " — " + data.reason : ""),
    start, end,
    { description: description }
  );
  event.setColor(CalendarApp.EventColor.GRAY);

  Logger.log("Block event created: " + event.getId() + " group=" + data.group_id);
  return { success: true, eventId: event.getId() };
}

/**
 * Borra TODOS los eventos de un bloqueo (ambos botes, todas las fechas).
 * data: { group_id }
 */
function handleDeleteBlockEvent(data) {
  if (!data.group_id) return { success: false, error: "Missing group_id" };

  var fragment = "BLOCK_GROUP: " + data.group_id;
  var now = new Date();
  var past = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  var future = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

  var calendars = [getCalendar('boat1'), getCalendar('boat2')]
    .filter(function (c) { return c !== null; });

  var deleted = 0;
  for (var i = 0; i < calendars.length; i++) {
    try {
      var events = calendars[i].getEvents(past, future);
      for (var j = 0; j < events.length; j++) {
        var desc = events[j].getDescription();
        if (desc && desc.indexOf(fragment) !== -1) {
          events[j].deleteEvent();
          deleted++;
        }
      }
    } catch (e) {
      Logger.log("deleteBlockEvent error on calendar " + i + ": " + e.toString());
    }
  }

  Logger.log("Block events deleted: " + deleted + " group=" + data.group_id);
  return { success: true, deleted: deleted };
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
    tour.indexOf('city-highlights-1h') !== -1 ||
    tour.indexOf('book-10p') !== -1 ||
    tour.indexOf('book-danish-breakfast') !== -1 ||
    tour.indexOf('Danish Breakfast') !== -1) return 1;

  if (tour.indexOf('Floating Wine') !== -1 || tour === 'book-wine') return 2;

  if (tour.indexOf('3 Hour') !== -1 ||
    tour.indexOf('3-Hour') !== -1 ||
    tour.indexOf('city-highlights-3h') !== -1) return 3;

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

/**
 * Mueve el evento de una reserva al calendario del otro bote.
 * CalendarApp no permite mover entre calendarios: se recrea y se borra el original.
 * data: { boat: 'boat1'|'boat2', gyg_booking_id?, sumup_id? }
 */
/**
 * Full edit from the admin panel: rebuilds title/description and moves the
 * event to the right boat calendar if it changed. Called from api/admin.js
 * PUT so any field the admin changes is reflected on the Google Calendar event.
 * data: { gyg_booking_id?, sumup_id?, boat?, tour?, date, time, endTime, qty,
 *         extras, lang, amount, currency, name, email, phone }
 */
function handleUpdateEvent(data) {
  var fragment = data.gyg_booking_id
    ? "GYG Ref: " + data.gyg_booking_id
    : (data.sumup_id ? "SumUp ID: " + data.sumup_id : null);
  if (!fragment) return { success: false, error: "Missing gyg_booking_id or sumup_id" };

  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var ev = findEventByDescriptionFragment(fragment);
    if (!ev) return { success: true, message: "No event found to update" };

    var tour = data.tour || data.tourTitle || "";
    var range = buildStartEnd(data.date, data.time, getTourDurationHours(tour, 1));
    var endTime = data.endTime ||
      (('0' + range.end.getHours()).slice(-2) + ':' + ('0' + range.end.getMinutes()).slice(-2));

    var description =
      "✨ " + (tour ? getTourDisplayName(tour) : "Reserva") + "\n" +
      "📅 " + data.date + " | 🕒 " + (data.time || "N/A") + " - " + endTime + "\n" +
      "👥 Passengers: " + (data.qty || "N/A") + "\n" +
      "🌍 Language: " + (data.lang || "N/A") + "\n" +
      "🍷 Extras: " + (data.extras && data.extras != "0" ? data.extras + " Tapas/Charcuterie" : "None") + "\n\n" +
      "👤 CONTACT\n" +
      "Name: " + (data.name || "N/A") + "\n" +
      "Email: " + (data.email || "N/A") + "\n" +
      "Phone: " + (data.phone || "N/A") + "\n" +
      "──────────────────────────\n" +
      (data.gyg_booking_id
        ? "GYG Ref: " + data.gyg_booking_id + "\nSource: GetYourGuide"
        : "SumUp ID: " + (data.sumup_id || "N/A") + "\nAmount: " + (data.amount ? data.amount + " " + (data.currency || "") : "N/A"));

    var title = data.gyg_booking_id
      ? "GYG: " + (data.name || 'Guest') + " " + (data.qty || '') + "p"
      : "Reserva: " + (data.name || 'Cliente');

    var targetBoat = data.boat === 'boat2' ? 'boat2' : (data.boat === 'boat1' ? 'boat1' : null);

    if (targetBoat) {
      var targetCal = getCalendar(targetBoat);
      var onTarget = ev.getOriginalCalendarId && ev.getOriginalCalendarId() === targetCal.getId();
      if (!onTarget) {
        // CalendarApp can't move events between calendars — recreate + delete original.
        var moved = targetCal.createEvent(title, range.start, range.end, {
          description: description,
          location: ev.getLocation()
        });
        try { if (ev.getColor()) moved.setColor(ev.getColor()); } catch (e) {}
        ev.deleteEvent();
        Logger.log("Event updated + moved to " + targetBoat + " (" + fragment + ")");
        return { success: true, eventId: moved.getId(), message: "Updated and moved to " + targetBoat };
      }
    }

    ev.setTitle(title);
    ev.setDescription(description);
    ev.setTime(range.start, range.end);
    Logger.log("Event updated: " + fragment);
    return { success: true, eventId: ev.getId(), message: "Updated" };
  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes the calendar event tied to a booking. Called from api/admin.js
 * PATCH (cancellation) so cancelling in the admin panel removes the event.
 * data: { gyg_booking_id?, sumup_id? }
 */
function handleDeleteEvent(data) {
  var fragment = data.gyg_booking_id
    ? "GYG Ref: " + data.gyg_booking_id
    : (data.sumup_id ? "SumUp ID: " + data.sumup_id : null);
  if (!fragment) return { success: false, error: "Missing gyg_booking_id or sumup_id" };

  var ev = findEventByDescriptionFragment(fragment);
  if (!ev) return { success: true, message: "No event found to delete" };

  ev.deleteEvent();
  Logger.log("Event deleted (updateEvent flow): " + fragment);
  return { success: true, message: "Event deleted" };
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
      footer: "© Seaduced Experience · Copenhagen, Denmark",
      pfSubject: "We couldn't complete your payment",
      pfGreeting: "Hi {name},",
      pfBody: "We noticed your payment for {tour} on {date}, {time} didn't go through. Don't worry — you haven't been charged, and no booking was made.",
      pfRetryButton: "Try the payment again",
      pfHelp: "Having trouble? Simply reply to this email and we'll help you out.",
      rmSubject: "Still want to book your Seaduced experience?",
      rmGreeting: "Hi {name},",
      rmBody: "Looks like you started booking {tour} for {date}, {time} but didn't finish the payment. Your spot isn't held yet — complete your booking before it's gone.",
      rmRetryButton: "Complete your booking",
      rmHelp: "Need help? Just reply to this email and we'll sort it out.",
      cancelSubject: "Your booking has been cancelled",
      cancelGreeting: "Hi {name},",
      cancelBody: "Your booking for {tour} on {date}, {time} has been cancelled. If you didn't request this or have any questions, just reply to this email.",
      cancelHelp: "Hope to see you on the water another time."
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
      footer: "© Seaduced Experience · Copenhague, Dinamarca",
      pfSubject: "No pudimos completar tu pago",
      pfGreeting: "Hola {name},",
      pfBody: "Notamos que tu pago para {tour} el {date}, {time} no se completó. Tranquilo/a, no se te cobró nada y no se creó ninguna reserva.",
      pfRetryButton: "Reintentar el pago",
      pfHelp: "¿Problemas? Simplemente responde este email y te ayudaremos.",
      rmSubject: "¿Todavía querés reservar tu experiencia Seaduced?",
      rmGreeting: "Hola {name},",
      rmBody: "Vimos que empezaste a reservar {tour} para el {date}, {time} pero no completaste el pago. Tu lugar todavía no está reservado — completá el pago antes de que se ocupe el horario.",
      rmRetryButton: "Completar mi reserva",
      rmHelp: "¿Necesitás ayuda? Respondé este email y te ayudamos.",
      cancelSubject: "Tu reserva ha sido cancelada",
      cancelGreeting: "Hola {name},",
      cancelBody: "Tu reserva para {tour} el {date}, {time} ha sido cancelada. Si no solicitaste esto o tienes alguna duda, simplemente responde a este email.",
      cancelHelp: "Esperamos verte en el agua en otra ocasión."
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
      footer: "© Seaduced Experience · København, Danmark",
      pfSubject: "Vi kunne ikke gennemføre din betaling",
      pfGreeting: "Hej {name},",
      pfBody: "Vi kunne se, at din betaling for {tour} den {date}, {time} ikke gik igennem. Bare rolig — du er ikke blevet opkrævet, og der er ikke oprettet nogen booking.",
      pfRetryButton: "Prøv betalingen igen",
      pfHelp: "Har du problemer? Svar blot på denne e-mail, så hjælper vi dig.",
      rmSubject: "Vil du stadig booke din Seaduced-oplevelse?",
      rmGreeting: "Hej {name},",
      rmBody: "Det ser ud til, at du startede en booking af {tour} den {date}, {time}, men ikke gennemførte betalingen. Din plads er endnu ikke reserveret — gennemfør din booking, før tiden er væk.",
      rmRetryButton: "Gennemfør din booking",
      rmHelp: "Brug for hjælp? Svar blot på denne e-mail, så hjælper vi dig.",
      cancelSubject: "Din booking er blevet annulleret",
      cancelGreeting: "Hej {name},",
      cancelBody: "Din booking for {tour} den {date}, {time} er blevet annulleret. Hvis du ikke har anmodet om dette, eller har spørgsmål, så svar blot på denne e-mail.",
      cancelHelp: "Vi håber at se dig på vandet en anden gang."
    }
  };
  return map[lang] || map.english;
}

/* ═══════════════════════════════════════════════════════════
   EMAIL
═══════════════════════════════════════════════════════════ */

function handleSendOtp(data) {
  if (!data.code) return { success: false, error: "Missing code" };
  try {
    var adminEmail = Session.getEffectiveUser().getEmail();
    GmailApp.sendEmail(
      adminEmail,
      "Seaduced Experience — Admin login code",
      "Your login code is: " + data.code + "\nExpires in 5 minutes.",
      {
        name: "Seaduced Admin",
        htmlBody: getOtpHtmlTemplate(data.code)
      }
    );
    return { success: true };
  } catch (e) {
    Logger.log("Send OTP error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

function getOtpHtmlTemplate(code) {
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED EXPERIENCE</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;border-top:3px solid #e8834a;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">Admin login code</p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#4a5568;line-height:1.7;">Use this code to finish signing in to the admin panel.</p>' +
    '<div style="text-align:center;margin:0 0 24px;">' +
    '<span style="display:inline-block;background-color:#f5f6f8;border-radius:8px;padding:16px 28px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0f1e35;">' + code + '</span>' +
    '</div>' +
    '<p style="margin:0;font-size:13px;color:#4a5568;text-align:center;">Expires in 5 minutes. If you didn\'t request this, you can ignore this email.</p>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +

    '<tr><td style="text-align:center;padding:0 16px;">' +
    '<p style="margin:0 0 4px;font-size:13px;color:#718096;">Seaduced Experience — Private boat tours in Copenhagen</p>' +
    '<p style="margin:0;font-size:11px;color:#a0aec0;">This is an automated security email.</p>' +
    '</td></tr>' +

    '</table></td></tr></table>' +
    '</body></html>';
}

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

function buildRetryUrl(data) {
  var lang = data.lang || 'english';
  var prefix = lang === 'spanish' ? '/es' : (lang === 'danish' ? '/da' : '');
  var params = [];
  if (data.tour) params.push('tour=' + encodeURIComponent(data.tour));
  params.push('qty=' + encodeURIComponent(data.qty || 1));
  params.push('tapas=' + encodeURIComponent(data.tapas || 0));
  if (data.date) params.push('date=' + encodeURIComponent(data.date));
  if (data.time) params.push('time=' + encodeURIComponent(data.time));
  params.push('lang=' + encodeURIComponent(lang));
  return 'https://seaduced-experience.com' + prefix + '/reserve?' + params.join('&');
}

function handlePaymentFailed(data) {
  if (!data.email) {
    return { success: false, error: "Missing email" };
  }
  var isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  if (!isValidEmail) {
    Logger.log("Payment-failed: invalid email, skipping: " + data.email);
    return { success: false, error: "Invalid email" };
  }
  try {
    var t = getTranslations(data.lang || 'english');
    GmailApp.sendEmail(data.email, "Seaduced Experience — " + t.pfSubject, "", {
      name: "Seaduced Experience",
      htmlBody: getPaymentFailedHtmlTemplate(data, t)
    });
    Logger.log("Payment-failed email sent to: " + data.email);
    return { success: true };
  } catch (e) {
    Logger.log("Payment-failed email error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/* ═══════════════════════════════════════════════════════════
   PAYMENT REMINDER — time-based trigger (reemplaza cron externo)
   Corre cada 10 min llamando a /api/payment-reminder en Vercel, que
   busca las PENDING abandonadas y devuelve la data para el email.
   Requiere Script Properties: SITE_URL y CRON_SECRET (mismo valor
   que la env var CRON_SECRET en Vercel).
═══════════════════════════════════════════════════════════ */

function setupPaymentReminderTrigger() {
  // Ejecutar ESTA función UNA sola vez a mano desde el editor de Apps
  // Script para instalar el trigger. No hace falta volver a correrla.
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'checkPendingPaymentReminders'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('checkPendingPaymentReminders')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('Payment-reminder trigger instalado: corre cada 10 min.');
}

function checkPendingPaymentReminders() {
  var props = PropertiesService.getScriptProperties();
  var siteUrl = props.getProperty('SITE_URL');
  var cronSecret = props.getProperty('CRON_SECRET');

  if (!siteUrl || !cronSecret) {
    Logger.log('checkPendingPaymentReminders: falta SITE_URL o CRON_SECRET en Script Properties.');
    return;
  }

  try {
    var response = UrlFetchApp.fetch(siteUrl + '/api/payment-reminder', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + cronSecret },
      muteHttpExceptions: true
    });
    Logger.log('checkPendingPaymentReminders: ' + response.getResponseCode() + ' — ' + response.getContentText());
  } catch (e) {
    Logger.log('checkPendingPaymentReminders error: ' + e.toString());
  }
}

function handlePaymentReminder(data) {
  if (!data.email) {
    return { success: false, error: "Missing email" };
  }
  var isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  if (!isValidEmail) {
    Logger.log("Payment-reminder: invalid email, skipping: " + data.email);
    return { success: false, error: "Invalid email" };
  }
  try {
    var t = getTranslations(data.lang || 'english');
    GmailApp.sendEmail(data.email, "Seaduced Experience \u2014 " + t.rmSubject, "", {
      name: "Seaduced Experience",
      htmlBody: getPaymentReminderHtmlTemplate(data, t)
    });
    Logger.log("Payment-reminder email sent to: " + data.email);
    return { success: true };
  } catch (e) {
    Logger.log("Payment-reminder email error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

function handleSendCancellationEmail(data) {
  if (!data.email) {
    return { success: false, error: "Missing email" };
  }
  var isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  if (!isValidEmail) {
    Logger.log("Cancellation email: invalid email, skipping: " + data.email);
    return { success: false, error: "Invalid email" };
  }
  try {
    var t = getTranslations(data.lang || 'english');
    GmailApp.sendEmail(data.email, "Seaduced Experience — " + t.cancelSubject, "", {
      name: "Seaduced Experience",
      htmlBody: getCancellationHtmlTemplate(data, t)
    });
    Logger.log("Cancellation email sent to: " + data.email);
    return { success: true };
  } catch (e) {
    Logger.log("Cancellation email error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

function getCancellationHtmlTemplate(data, t) {
  var greeting = t.cancelGreeting.replace("{name}", data.name || "there");
  var tourName = data.tourTitle || getTourDisplayName(data.tour || "");
  var body = t.cancelBody
    .replace("{tour}", "<strong>" + tourName + "</strong>")
    .replace("{date}", "<strong>" + (data.date || "—") + "</strong>")
    .replace("{time}", "<strong>" + (data.time || "—") + "</strong>");

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#f87171;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED EXPERIENCE</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;border-top:3px solid #f87171;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">' + greeting + '</p>' +
    '<p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.7;">' + body + '</p>' +
    '<p style="margin:0;font-size:13px;color:#4a5568;text-align:center;">' + t.cancelHelp + '</p>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +

    '<tr><td style="text-align:center;padding:0 16px;">' +
    '<p style="margin:0 0 4px;font-size:13px;color:#718096;">' + t.tagline + '</p>' +
    '<p style="margin:0;font-size:11px;color:#a0aec0;">' + t.footer + '</p>' +
    '</td></tr>' +

    '</table></td></tr></table>' +
    '</body></html>';
}

function getPaymentFailedHtmlTemplate(data, t) {
  var greeting = t.pfGreeting.replace("{name}", data.name || "there");
  var tourName = data.tourTitle || getTourDisplayName(data.tour || "");
  var body = t.pfBody
    .replace("{tour}", "<strong>" + tourName + "</strong>")
    .replace("{date}", "<strong>" + (data.date || "—") + "</strong>")
    .replace("{time}", "<strong>" + (data.time || "—") + "</strong>");
  var retryUrl = buildRetryUrl(data);

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED EXPERIENCE</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;border-top:3px solid #e8834a;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">' + greeting + '</p>' +
    '<p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.7;">' + body + '</p>' +
    '<div style="text-align:center;margin:24px 0 20px;">' +
    '<a href="' + retryUrl + '" style="display:inline-block;background-color:#e8834a;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">' +
    t.pfRetryButton.toUpperCase() +
    '</a>' +
    '</div>' +
    '<p style="margin:0;font-size:13px;color:#4a5568;text-align:center;">' + t.pfHelp + '</p>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +

    '<tr><td style="text-align:center;padding:0 16px;">' +
    '<p style="margin:0 0 4px;font-size:13px;color:#718096;">' + t.tagline + '</p>' +
    '<p style="margin:0;font-size:11px;color:#a0aec0;">' + t.footer + '</p>' +
    '</td></tr>' +

    '</table></td></tr></table>' +
    '</body></html>';
}

function getPaymentReminderHtmlTemplate(data, t) {
  var greeting = t.rmGreeting.replace("{name}", data.name || "there");
  var tourName = data.tourTitle || getTourDisplayName(data.tour || "");
  var body = t.rmBody
    .replace("{tour}", "<strong>" + tourName + "</strong>")
    .replace("{date}", "<strong>" + (data.date || "\u2014") + "</strong>")
    .replace("{time}", "<strong>" + (data.time || "\u2014") + "</strong>");
  var retryUrl = buildRetryUrl(data);

  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background-color:#f5f6f8;font-family:Arial,sans-serif;">' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#e8834a;height:4px;font-size:0;">&nbsp;</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="background-color:#0f1e35;padding:32px 20px;text-align:center;">' +
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED EXPERIENCE</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">COPENHAGEN</div>' +
    '</td>' +
    '</tr></table>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 16px 48px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;">' +

    '<tr><td style="background:#ffffff;border-radius:12px;padding:32px;border-top:3px solid #e8834a;">' +
    '<p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f1e35;line-height:1.3;">' + greeting + '</p>' +
    '<p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.7;">' + body + '</p>' +
    '<div style="text-align:center;margin:24px 0 20px;">' +
    '<a href="' + retryUrl + '" style="display:inline-block;background-color:#e8834a;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:1px;">' +
    t.rmRetryButton.toUpperCase() +
    '</a>' +
    '</div>' +
    '<p style="margin:0;font-size:13px;color:#4a5568;text-align:center;">' + t.rmHelp + '</p>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +

    '<tr><td style="text-align:center;padding:0 16px;">' +
    '<p style="margin:0 0 4px;font-size:13px;color:#718096;">' + t.tagline + '</p>' +
    '<p style="margin:0;font-size:11px;color:#a0aec0;">' + t.footer + '</p>' +
    '</td></tr>' +

    '</table></td></tr></table>' +
    '</body></html>';
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
    var groupSuffix = data.groupNumber ? " — GRUPO " + data.groupNumber : "";
    GmailApp.sendEmail(
      adminEmail,
      "⚓ Nueva Reserva — " + tourDisplayName + " · " + (data.name || "") + " · " + (data.date || "") + groupSuffix,
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
    '<div translate="no" style="font-size:13px;letter-spacing:5px;color:#ffffff;font-weight:700;">SEADUCED EXPERIENCE</div>' +
    '<div translate="no" style="font-size:9px;letter-spacing:4px;color:#e8834a;margin-top:6px;">COPENHAGEN</div>' +
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
      welcome:      "Welcome aboard Seaduced Experience",
      rulesHeading: "BEFORE WE DEPART",
      rulesIntro:   "It's important to know that:",
      rules: [
        "Bringing your own food or drinks isn't allowed.",
        "If your package includes food and drinks, they'll be served on board.",
        "If not included, drinks can be purchased on the boat — food can be pre‑ordered 48 hours in advance.",
        "Dogs and smoking are not allowed on board."
      ]
    },
    spanish: {
      welcome:      "Bienvenido a bordo de Seaduced Experience",
      rulesHeading: "ANTES DE PARTIR",
      rulesIntro:   "Es importante que sepas que:",
      rules: [
        "No está permitido traer comida ni bebida propia.",
        "Si tu paquete incluye comida y bebida, serán servidos a bordo.",
        "Si no están incluidos, puedes comprar bebidas en el barco — la comida puede pedirse con 48 h de antelación.",
        "No se permiten perros ni fumar a bordo."
      ]
    },
    danish: {
      welcome:      "Velkommen om bord hos Seaduced Experience",
      rulesHeading: "INDEN VI AFSEJLER",
      rulesIntro:   "Det er vigtigt at vide:",
      rules: [
        "Det er ikke tilladt at medbringe egen mad eller drikkevarer.",
        "Hvis din pakke inkluderer mad og drikkevarer, serveres de om bord.",
        "Hvis ikke inkluderet, kan drikkevarer købes på båden — mad kan forudbestilles 48 timer i forvejen.",
        "Hunde og rygning er ikke tilladt om bord."
      ]
    }
  };

  var c = content[lang] || content.english;

  var rulesHtml = c.rules.map(function(item, i) {
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
  var isWine = data.tour === 'book-wine' && data.groupNumber;
  var groupLabel = isWine ? 'GRUPO ' + data.groupNumber + ' de 2' : null;

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
    (groupLabel ?
      '<p style="margin:10px 0 0;"><span style="display:inline-block;background:#0f1e35;color:#e8834a;font-size:12px;font-weight:700;letter-spacing:2px;padding:5px 14px;border-radius:4px;border:1px solid #e8834a;">' + groupLabel + '</span></p>'
      : '') +
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
    email: "nicollanos8799@gmail.com",
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
