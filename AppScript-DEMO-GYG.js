/**
 * Google Apps Script — Seaduced Experience [DEMO]
 * GetYourGuide email parser → auto-sync bookings to Google Calendar
 *
 * ARCHITECTURE
 *   GYG Parser  → trigger setup, email processing, calendar event creation
 *   Tests       → run manually from the Apps Script editor
 *
 * DEPENDENCIES (defined in AppScript-DEMO-BookingWeb.js — same project):
 *   getCalendar(), getTourDurationHours(), buildStartEnd(), findEventByDescriptionFragment()
 */

/* ═══════════════════════════════════════════════════════════
   GYG EMAIL PARSER
═══════════════════════════════════════════════════════════ */

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

function processGYGBookings() {
  var processedRefs = {};

  var threads = GmailApp.search(
    'from:do-not-reply@notification.getyourguide.com subject:Booking newer_than:30d'
  );

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      try {
        var booking = parseGYGEmail(msg);
        if (booking) {
          if (processedRefs[booking.gygRef]) {
            Logger.log("Already processed this run: " + booking.gygRef);
            return;
          }
          processedRefs[booking.gygRef] = true;
          var eventId = createGYGCalendarEvent(booking);
          Logger.log("GYG booked → " + booking.gygRef + " | event: " + eventId);
        }
      } catch (e) {
        Logger.log("GYG parse error: " + e.toString());
      }
    });
  });
}

function parseGYGEmail(msg, skipDedup) {
  var subject = msg.getSubject();
  var html = msg.getBody();

  // GYG reference from subject
  var refMatch = subject.match(/\b(GYG[A-Z0-9]+)\b/);
  if (!refMatch) return null;
  var gygRef = refMatch[1];

  // Reject non-booking emails — require structural fields
  var hasBookingFields =
    html.indexOf('Reference number') !== -1 &&
    html.indexOf('Number of participants') !== -1 &&
    html.indexOf('Main customer') !== -1;
  if (!hasBookingFields) return null;

  // Skip if already in calendar
  if (!skipDedup && findGYGEvent(gygRef)) {
    Logger.log("Already in calendar: " + gygRef);
    return null;
  }

  // Tour name — <p class="activity activity-title"> or image alt
  var tour = 'GYG Tour';
  var tourMatch = html.match(/class="activity activity-title"[^>]*>([^<]+)<\/p>/);
  if (!tourMatch) tourMatch = html.match(/alt="([^"]+)"\s+src="[^"]+cdn\.getyourguide/);
  if (tourMatch) tour = tourMatch[1].trim();

  // Date + time — <strong> after "Date" label
  var dateStr = '—';
  var timeStr = '10:00';
  var dateHtmlMatch = html.match(/>\s*Date\s*<\/p>[\s\S]{0,300}?<strong[^>]*>([^<]+)<\/strong>/);
  if (dateHtmlMatch) {
    var d = new Date(dateHtmlMatch[1].trim());
    if (!isNaN(d.getTime())) {
      dateStr = d.getFullYear() + '-'
        + ('0' + (d.getMonth() + 1)).slice(-2) + '-'
        + ('0' + d.getDate()).slice(-2);
      timeStr = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
  }

  // Participants — <strong>4</strong> Persons
  var qty = '1';
  var paxMatch = html.match(/<strong>(\d+)<\/strong>\s*Persons?\)/i);
  if (!paxMatch) paxMatch = html.match(/\((\d+)\s*Persons?\)/i);
  if (paxMatch) qty = paxMatch[1];

  // Language
  var lang = 'english';
  var langMatch = html.match(/Language:\s*<\/span>[\s\S]{0,50}?<span[^>]*>([^<]+)<\/span>/);
  if (!langMatch) langMatch = html.match(/Language:\s*([A-Za-z]+)/);
  if (langMatch) {
    var lv = langMatch[1].toLowerCase();
    if (lv.indexOf('spanish') !== -1 || lv.indexOf('español') !== -1) lang = 'spanish';
    else if (lv.indexOf('danish') !== -1 || lv.indexOf('dansk') !== -1) lang = 'danish';
  }

  // Price — <span> after "Price" label
  var amount = '', currency = 'DKK';
  var priceMatch = html.match(/>\s*Price\s*<\/p>[\s\S]{0,300}?<span[^>]*>([^<]+)<\/span>/);
  if (priceMatch) {
    var ps = priceMatch[1].trim();
    var currMatch = ps.match(/^([A-Z]{3})/);
    var numMatch = ps.match(/([\d,\.]+)/);
    if (currMatch) currency = currMatch[1];
    if (numMatch) amount = numMatch[1].replace(/,/g, '');
  }

  // Customer
  var nameMatch = html.match(/>\s*Main customer\s*<\/p>[\s\S]{0,300}?<span[^>]*>([^<]+)<\/span>/);
  var emailMatch = html.match(/customer-[a-z0-9]+@reply\.getyourguide\.com/);
  var phoneMatch = html.match(/Phone:\s*<\/span>[\s\S]{0,100}?<span[^>]*>([^<]+)<\/span>/);
  if (!phoneMatch) phoneMatch = html.match(/Phone:\s*(\+[\d\s]+)/);

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

function createGYGCalendarEvent(booking) {
  var durationH = getTourDurationHours(booking.tour, 2);
  var range = buildStartEnd(booking.date, booking.time, durationH);

  var description =
    "✨ " + booking.tour.toUpperCase() + "\n" +
    "📅 " + booking.date + " | 🕒 " + booking.time + "\n" +
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

  var eventTitle = "GYG: " + booking.name + " " + booking.qty + "p " + durationH + "h";

  var event = getCalendar('boat1').createEvent(
    eventTitle,
    range.start, range.end,
    { description: description }
  );

  return event.getId();
}

function findGYGEvent(gygRef) {
  return findEventByDescriptionFragment("GYG Ref: " + gygRef);
}

/* ═══════════════════════════════════════════════════════════
   TESTS
═══════════════════════════════════════════════════════════ */

function testGYGParser() {
  var threads = GmailApp.search(
    'from:do-not-reply@notification.getyourguide.com subject:Booking',
    0, 1
  );
  if (!threads.length) { Logger.log("No GYG emails found."); return; }

  var messages = threads[0].getMessages();
  if (!messages.length) { Logger.log("Thread has no messages."); return; }

  var msg = messages[0];
  var subject = msg.getSubject();
  var refMatch = subject.match(/\b(GYG[A-Z0-9]+)\b/);
  Logger.log("GYG Ref: " + (refMatch ? refMatch[1] : "NOT FOUND"));

  var booking = parseGYGEmail(msg, true);
  Logger.log("Parsed booking: " + JSON.stringify(booking, null, 2));
}
