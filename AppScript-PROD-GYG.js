/**
 * Google Apps Script — Seaduced Experience
 * GetYourGuide email parser → auto-sync bookings to Google Calendar
 *
 * ARCHITECTURE
 *   GYG Parser  → trigger setup, email processing, calendar event creation
 *   Tests       → run manually from the Apps Script editor
 *
 * DEPENDENCIES (defined in Booking.gs — same project):
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
  var body = msg.getPlainBody();

  // GYG reference from subject
  var refMatch = subject.match(/\b(GYG[A-Z0-9]+)\b/);
  if (!refMatch) return null;
  var gygRef = refMatch[1];

  // Reject non-booking emails — require structural fields
  var hasBookingFields =
    body.indexOf('Reference number') !== -1 &&
    body.indexOf('Number of participants') !== -1 &&
    body.indexOf('Main customer') !== -1;
  if (!hasBookingFields) return null;

  // Skip if already in calendar
  if (!skipDedup && findGYGEvent(gygRef)) {
    Logger.log("Already in calendar: " + gygRef);
    return null;
  }

  // Tour name — first non-empty, non-image line after booking trigger phrase
  var tour = 'GYG Tour';
  var lines = body.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Your offer has been booked:') !== -1 ||
        lines[i].indexOf("You've received a last-minute booking:") !== -1) {
      for (var j = i + 1; j < lines.length; j++) {
        var l = lines[j].trim();
        if (l && l.indexOf('[image:') === -1) { tour = l; break; }
      }
      break;
    }
  }

  // Date + time
  var dateStr = '—';
  var timeStr = '10:00';
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

  // Participants — search 200 chars after label in plain body
  // Fallback to HTML body if plain body doesn't include (X Persons)
  var qty = '1';
  var paxIdx = body.indexOf('Number of participants');
  if (paxIdx !== -1) {
    var paxSection = body.substring(paxIdx, paxIdx + 200);
    var parenMatch = paxSection.match(/\((\d+)\s*Persons?\)/i);
    var groupMatch = paxSection.match(/(\d+)\s*x\s*(?:Group|Adult|Child)/i);
    if (parenMatch) qty = parenMatch[1];
    else if (groupMatch) qty = groupMatch[1];
  }
  if (qty === '1') {
    var htmlBody = msg.getBody();
    var htmlParenMatch = htmlBody.match(/\((\d+)\s*Persons?\)/i);
    if (htmlParenMatch) qty = htmlParenMatch[1];
  }

  // Language
  var lang = 'english';
  var langMatch = body.match(/Language:\s*([^\n]+)/);
  if (langMatch) {
    var lv = langMatch[1].toLowerCase();
    if (lv.indexOf('spanish') !== -1 || lv.indexOf('español') !== -1) lang = 'spanish';
    else if (lv.indexOf('danish') !== -1 || lv.indexOf('dansk') !== -1) lang = 'danish';
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

function createGYGCalendarEvent(booking) {
  var durationH = getTourDurationHours(booking.tour, 2);
  var range = buildStartEnd(booking.date, booking.time, durationH);

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
