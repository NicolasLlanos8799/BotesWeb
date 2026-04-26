/**
 * SEADUCED EXPERIENCE - GOOGLE CALENDAR BRIDGE (V6.0 - Monthly Sync)
 * 
 * Instructions:
 * 1. Go to https://script.google.com
 * 2. Click "Manage Deployments" -> Pencil Icon -> Version: "New Version" -> "Deploy".
 * 3. Script URL: [YOUR_DEPLOYED_URL_HERE] (Store this in GAS_URL environment variable)
 * 4. This version supports monthly pre-fetching for instant UI updates.
 */

var START_HOUR = 9;   
var END_HOUR = 16;    
var DEFAULT_DURATION = 1; 

// CALENDAR CONFIGURATION
var CALENDAR_IDS = {
  boat1: "ad4644278f9ee9075ebb8a8bb0c8eca457cdc3fe908bd4b1eb7cd3b5f751ca71@group.calendar.google.com",
  boat2: "2772126ed76f0380789fb1af0e56d9e55313cc013cfc55f6e4f3b12b7cc35e72@group.calendar.google.com"
};

/**
 * Helper to get the correct calendar based on the requested type
 */
function getCalendar(calendarType) {
  var id = CALENDAR_IDS[calendarType];
  if (id) {
    try {
      return CalendarApp.getCalendarById(id);
    } catch (e) {
      Logger.log("Error getting calendar by ID: " + e.toString());
    }
  }
  return CalendarApp.getDefaultCalendar();
}

function doGet(e) {
  var action = e.parameter.action;
  var callback = e.parameter.callback;
  var responseData;

  if (action === 'getMonthlyAvailability') {
    responseData = handleMonthlyAvailability(e.parameter.date, e.parameter.calendar);
  } else if (action === 'getAvailability') {
    responseData = handleGetAvailability(e.parameter.date, e.parameter.calendar);
  } else if (action === 'createBooking') {
    try {
      var data = JSON.parse(e.parameter.data);
      responseData = handleCreateBooking(data);
    } catch (err) {
      responseData = { success: false, error: "JSON Parse error" };
    }
  } else if (action === 'confirmBooking') {
    try {
      var data = JSON.parse(e.parameter.data);
      responseData = handleConfirmBooking(data);
    } catch (err) {
      responseData = { success: false, error: "JSON Parse error" };
    }
  } else {
    responseData = { message: "Seaduced Bridge V6 Online" };
  }

  var output = JSON.stringify(responseData);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + output + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = e.parameter.action;
    var responseData;
    
    if (action === 'confirmBooking') {
      responseData = handleConfirmBooking(data);
    } else {
      responseData = handleCreateBooking(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Returns a map of all slots for a whole month
 * Format: { "2026-04-01": [...], "2026-04-02": [...], ... }
 */
function handleMonthlyAvailability(dateString, calendarType) {
  var calendar = getCalendar(calendarType);
  var parts = dateString.split('-'); 
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]) - 1;
  
  var firstDay = new Date(year, month, 1, 0, 0, 0);
  var lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  var events = calendar.getEvents(firstDay, lastDay);
  var monthMap = {};
  
  // Calculate slots for each day of the month
  for (var d = 1; d <= lastDay.getDate(); d++) {
    var date = new Date(year, month, d);
    var dateKey = parts[0] + "-" + (month + 1 < 10 ? "0" + (month + 1) : month + 1) + "-" + (d < 10 ? "0" + d : d);
    var slots = [];
    
    for (var h = START_HOUR; h <= END_HOUR; h++) {
      var sStart = new Date(year, month, d, h, 0, 0).getTime();
      var sEnd = new Date(year, month, d, h + DEFAULT_DURATION, 0, 0).getTime();
      
      var isBusy = events.some(function(event) {
        var eStart = event.getStartTime().getTime();
        var eEnd = event.getEndTime().getTime();
        return (eStart < sEnd && eEnd > sStart);
      });
      
      slots.push({
        time: (h < 10 ? '0' + h : h) + ':00',
        available: !isBusy
      });
    }
    monthMap[dateKey] = slots;
  }
  
  return monthMap;
}

function handleGetAvailability(dateString, calendarType) {
  var calendar = getCalendar(calendarType);
  var parts = dateString.split('-'); 
  var date = new Date(parts[0], parts[1]-1, parts[2]);
  
  var startDay = new Date(date.getTime());
  startDay.setHours(0, 0, 0, 0);
  var endDay = new Date(date.getTime());
  endDay.setHours(23, 59, 59, 999);
  
  var events = calendar.getEvents(startDay, endDay);
  var slots = [];
  
  for (var h = START_HOUR; h <= END_HOUR; h++) {
    var sStart = new Date(date.getTime());
    sStart.setHours(h, 0, 0, 0);
    var sEnd = new Date(date.getTime());
    sEnd.setHours(h + DEFAULT_DURATION, 0, 0, 0);
    
    var isBusy = events.some(function(event) {
      return (event.getStartTime().getTime() < sEnd.getTime() && event.getEndTime().getTime() > sStart.getTime());
    });
    
    slots.push({
      time: (h < 10 ? '0' + h : h) + ':00',
      available: !isBusy
    });
  }
  return slots;
}

function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar);
  var durationH = 2; // Default
  if(data.tour && (data.tour.includes('1-Hour') || data.tour.includes('City Highlights') || data.tour.includes('book-1h'))) durationH = 1;
  if(data.tour && data.tour.includes('Floating Wine')) durationH = 2;
  if(data.tour && data.tour.includes('3-Hour')) durationH = 3;
  if(data.tour && data.tour.includes('4-Hour')) durationH = 4;
  if(data.tour && data.tour.includes('Malmö')) durationH = 7;

  var parts = data.date.split('-');
  var timeParts = data.time.split(':');
  
  var start = new Date(parts[0], parts[1]-1, parts[2], timeParts[0], timeParts[1]);
  var end = new Date(start.getTime() + durationH * 60 * 60 * 1000);

  var timeStr = Utilities.formatDate(start, "GMT+1", "H:mm") + " - " + Utilities.formatDate(end, "GMT+1", "H:mm");
  var extrasStr = data.tapas > 0 ? (data.tapas + " Charcuterie") : "None";

  var status = data.payment_status || 'PENDING';
  var description = "Status: " + status + "\n" +
                    "SumUp ID: " + (data.sumup_checkout_id || 'N/A') + "\n" +
                    "Tour: " + data.tour + "\n" +
                    "Date: " + data.date + "\n" +
                    "Time: " + timeStr + "\n" +
                    "Passengers: " + data.qty + "\n" +
                    "Language: " + data.lang + "\n" +
                    "Extras: " + extrasStr + "\n" +
                    "Name: " + (data.name || 'N/A') + "\n" +
                    "Email: " + (data.email || 'N/A') + "\n" +
                    "Phone: " + (data.phone || 'N/A');

  var title = (status === 'PENDING' ? "[PENDIENTE] " : "Reserva: ") + data.tour;
  var event = calendar.createEvent(title, start, end, {
    description: description
  });

  // Set color for pending bookings
  if (status === 'PENDING') {
    event.setColor(CalendarApp.EventColor.GRAY);
  } else {
    event.setColor(CalendarApp.EventColor.PALE_GOLD);
  }
  
  var lang = data.lang || 'english';
  var t = getTranslations(lang);
  
  // LOG DE SEGURIDAD
  Logger.log("Procesando reserva. Estado recibido: " + status);
  
  // SOLAMENTE ENVIAR EMAIL Y AÑADIR GUEST SI ESTÁ PAGADO EXPLÍCITAMENTE
  if (status === 'PAID' || status === 'paid') {
    Logger.log("Procediendo con envío de emails (Pago Confirmado)");
    if (data.email) {
      try {
        event.addGuest(data.email);
      } catch (e) {
        Logger.log("Could not add guest: " + e.toString());
      }
    }

    try {
      sendBookingEmails(data, t, start, end);
    } catch (e) {
      var errorMsg = "\n\n[ERROR DE EMAIL]: " + e.toString();
      event.setDescription(description + errorMsg);
    }
  } else {
    Logger.log("Reserva en espera de pago. No se envían emails al cliente.");
  }

  return { success: true, eventId: event.getId(), status: status };
}

/**
 * Recovers data from event description and confirms the booking
 */
function handleConfirmBooking(data) {
  var eventId = data.eventId;
  if (!eventId) return { success: false, error: "Missing eventId" };
  
  // Try to find the event in all calendars
  var event = null;
  var calendars = [getCalendar('boat1'), getCalendar('boat2')];
  for (var i = 0; i < calendars.length; i++) {
    event = calendars[i].getEventById(eventId);
    if (event) break;
  }
  
  if (!event) return { success: false, error: "Event not found: " + eventId };
  
  var description = event.getDescription();
  if (description.includes("Status: PAID")) {
    return { success: true, message: "Already confirmed" };
  }
  
  // Parse data from description to send emails
  var bookingData = {};
  var lines = description.split("\n");
  lines.forEach(function(line) {
    if (line.startsWith("Tour: ")) bookingData.tour = line.replace("Tour: ", "");
    if (line.startsWith("Date: ")) bookingData.date = line.replace("Date: ", "");
    if (line.startsWith("Time: ")) bookingData.time = line.replace("Time: ", "").split(" - ")[0]; // Get start time
    if (line.startsWith("Passengers: ")) bookingData.qty = line.replace("Passengers: ", "");
    if (line.startsWith("Language: ")) bookingData.lang = line.replace("Language: ", "");
    if (line.startsWith("Name: ")) bookingData.name = line.replace("Name: ", "");
    if (line.startsWith("Email: ")) bookingData.email = line.replace("Email: ", "");
    if (line.startsWith("Phone: ")) bookingData.phone = line.replace("Phone: ", "");
    if (line.startsWith("Extras: ")) bookingData.tapas = (line.includes("Charcuterie") ? parseInt(line) : 0);
  });
  
  // Update status in description
  var newDescription = description.replace("Status: PENDING", "Status: PAID");
  if (data.sumup_checkout_id) {
    newDescription = newDescription.replace("SumUp ID: N/A", "SumUp ID: " + data.sumup_checkout_id);
  }
  event.setDescription(newDescription);
  
  // Update title and color
  event.setTitle(event.getTitle().replace("[PENDIENTE] ", "Reserva: "));
  event.setColor(CalendarApp.EventColor.PALE_GOLD);
  
  // Add guest and send emails
  if (bookingData.email) {
    try {
      event.addGuest(bookingData.email);
    } catch (e) {
      Logger.log("Could not add guest on confirmation: " + e.toString());
    }
  }

  var lang = bookingData.lang || 'english';
  var t = getTranslations(lang);
  var start = event.getStartTime();
  var end = event.getEndTime();
  
  try {
    sendBookingEmails(bookingData, t, start, end);
  } catch (e) {
    Logger.log("Email confirmation error: " + e.toString());
  }
  
  return { success: true, status: "PAID" };
}

function isSpanish(lang) { return lang === 'spanish'; }
function isDanish(lang) { return lang === 'danish'; }

/**
 * Centralized translations for English, Spanish, and Danish
 */
function getTranslations(lang) {
  var map = {
    english: {
      subject: "Your Seaduced Experience is Confirmed!",
      intro: "Hello {name},",
      body: "Your booking for <b>{tour}</b> has been successfully confirmed. We are thrilled to have you on board!",
      details: "Booking Details:",
      tour: "Tour:",
      date: "Date:",
      time: "Time:",
      passengers: "Passengers:",
      extras: "Extras:",
      location: "Departure Point:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Open in Google Maps",
      footer: "If you have any questions, feel free to contact us via WhatsApp or reply to this email.",
      thanks: "See you soon!"
    },
    spanish: {
      subject: "¡Tu Seaduced Experience está Confirmada!",
      intro: "Hola {name},",
      body: "Tu reserva para <b>{tour}</b> ha sido confirmada con éxito. ¡Estamos encantados de tenerte a bordo!",
      details: "Detalles de la reserva:",
      tour: "Tour:",
      date: "Fecha:",
      time: "Hora:",
      passengers: "Pasajeros:",
      extras: "Extras:",
      location: "Punto de salida:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Abrir en Google Maps",
      footer: "Si tienes alguna pregunta, no dudes en contactarnos por WhatsApp o respondiendo a este email.",
      thanks: "¡Nos vemos pronto!"
    },
    danish: {
      subject: "Din Seaduced Experience er Bekræftet!",
      intro: "Hej {name},",
      body: "Din booking for <b>{tour}</b> er blevet bekræftet. Vi glæder os altså til at se dig om bord!",
      details: "Bookingdetaljer:",
      tour: "Tour:",
      date: "Dato:",
      time: "Tidspunkt:",
      passengers: "Passagerer:",
      extras: "Extras:",
      location: "Afgangssted:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Åbn i Google Maps",
      footer: "Hvis du har spørgsmål, er du velkommen til at kontakte os via WhatsApp eller svare på denne e-mail.",
      thanks: "Vi ses snart!"
    }
  };
  return map[lang] || map.english;
}

/**
 * Sends confirmation email to the guest and notification to the owner
 */
function sendBookingEmails(data, t, start, end) {
  var lang = data.lang || 'english';
  if (!t) t = getTranslations(lang);

  // 1. Prepare HTML Content
  var htmlBody = getHtmlTemplate(data, t);
  
  // 2. Prepare ICS Attachment
  var icsBlob;
  try {
    var title = "Seaduced: " + data.tour;
    var location = t.locationVal;
    var description = t.body.replace("<b>", "").replace("</b>", "") + "\n\n" + 
                      t.tour + " " + data.tour + "\n" +
                      t.date + " " + data.date + "\n" +
                      t.time + " " + data.time;
    icsBlob = createIcsBlob(title, start, end, description, location);
  } catch (e) {
    Logger.log("ICS Generation Error: " + e.toString());
  }

  // 3. Send to Guest
  if (data.email) {
    var guestOptions = {
      name: "Seaduced Experience",
      htmlBody: htmlBody
    };
    if (icsBlob) guestOptions.attachments = [icsBlob];
    
    GmailApp.sendEmail(data.email, "Seaduced Experience - " + t.subject, "", guestOptions);
  }

  // 4. Send to Admin (Owner)
  var adminEmail = Session.getEffectiveUser().getEmail();
  if (!adminEmail) adminEmail = data.email; 
  
  var adminSubject = "[NUEVA RESERVA] " + data.tour + " - " + data.name;
  var adminHtml = "<h3>Tienes una nueva solicitud de reserva</h3>" +
                  "<p><b>CLIENTE:</b> " + data.name + "<br>" +
                  "<b>EMAIL:</b> " + data.email + "<br>" +
                  "<b>TELÉFONO:</b> " + (data.phone || "-") + "</p>" +
                  "<hr>" + htmlBody;

  var adminOptions = {
    name: "Seaduced Booking System",
    htmlBody: adminHtml
  };
  if (icsBlob) adminOptions.attachments = [icsBlob];

  GmailApp.sendEmail(adminEmail, adminSubject, "", adminOptions);
}

/**
 * Universal iCalendar (.ics) Generator
 */
function createIcsBlob(title, start, end, description, location) {
  var ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seaduced Experience//NONSGML v1.0//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:" + Utilities.getUuid(),
    "DTSTAMP:" + formatDateToIcs(new Date()),
    "DTSTART:" + formatDateToIcs(start),
    "DTEND:" + formatDateToIcs(end),
    "SUMMARY:" + title,
    "DESCRIPTION:" + description.replace(/\n/g, "\\n"),
    "LOCATION:" + location,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder - Seaduced Experience",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  
  return Utilities.newBlob(ics, "text/calendar", "invite.ics");
}

function formatDateToIcs(date) {
  return Utilities.formatDate(date, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Premium HTML Template for confirmation emails
 */
function getHtmlTemplate(data, t) {
  var accentColor = "#D4AF37"; // Gold / Luxury accent
  var bgColor = "#f8f9fa";
  var navyColor = "#0f1e35"; // From --clr-navy
  
  return `
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
      ${getJsonLdMarkup(data, t)}
    </head>
    <div style="font-family: 'Inter', system-ui, sans-serif; background-color: ${bgColor}; padding: 40px 10px; color: #1a1a1a;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #eee;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${navyColor} 0%, #333 100%); padding: 30px; text-align: center;">
          <h1 style="font-family: 'Playfair Display', serif; color: ${accentColor}; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">SEADUCED</h1>
          <p style="font-family: 'Inter', sans-serif; color: #999; margin: 5px 0 0 0; font-size: 11px; letter-spacing: 3px; font-weight: 400; text-transform: uppercase;">Luxury Boat Experience</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px 30px;">
          <h2 style="font-family: 'Playfair Display', serif; margin-top: 0; font-weight: 700; font-size: 24px; color: ${navyColor};">${t.intro.replace("{name}", data.name)}</h2>
          <p style="font-family: 'Inter', sans-serif; line-height: 1.6; color: #444; font-size: 15px;">${t.body.replace("{tour}", data.tour)}</p>
          
          <div style="background: ${bgColor}; border-radius: 12px; padding: 25px; margin: 30px 0; border: 1px dashed #ddd;">
            <h3 style="font-family: 'Inter', sans-serif; margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 20px; font-weight: 600;">${t.details}</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif;">
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.tour}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.tour}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.date}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.date}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.time}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.time}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.passengers}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.qty || 1}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.extras}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.tapas || 0} Tapas/Charcuterie</td>
              </tr>
              <tr>
                <td style="padding: 15px 0 8px 0; color: #888; font-size: 14px;">${t.location}</td>
                <td style="padding: 15px 0 8px 0; text-align: right; font-weight: 600; color: ${accentColor}; font-size: 13px;">
                  ${t.locationVal}<br>
                  <a href="https://share.google/CRsObwvGX3UAhmAgO" style="display: inline-block; background-color: ${navyColor}; color: #ffffff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; margin-top: 8px; letter-spacing: 0.3px;">
                    📍 ${t.mapButton}
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <p style="font-family: 'Playfair Display', serif; text-align: center; margin-top: 30px; font-weight: 700; font-size: 18px; color: ${navyColor};">${t.thanks}</p>
        </div>

        <!-- Footer -->
        <div style="font-family: 'Inter', sans-serif; padding: 30px; background: #fafafa; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999;">
          <p style="margin: 0;">${t.footer}</p>
          <div style="margin-top: 20px;">
            <a href="https://seaducedexperience.com" style="color: ${accentColor}; text-decoration: none; font-weight: 600; letter-spacing: 1px;">SEADUCEDEXPERIENCE.COM</a>
          </div>
        </div>
      </div>
      
      <div style="font-family: 'Inter', sans-serif; text-align: center; padding-top: 20px; font-size: 10px; color: #aaa; letter-spacing: 0.5px;">
        © 2026 SEADUCED EXPERIENCE COPENHAGEN. ALL RIGHTS RESERVED.
      </div>
    </div>
  `;
}

/**
 * Schema.org JSON-LD for Gmail Smart Banners
 */
function getJsonLdMarkup(data, t) {
  var isoDate = data.date + "T" + data.time + ":00";
  
  var json = {
    "@context": "http://schema.org",
    "@type": "EventReservation",
    "reservationNumber": "SEAD-" + Date.now().toString().slice(-6),
    "reservationStatus": "http://schema.org/Confirmed",
    "underName": {
      "@type": "Person",
      "name": data.name
    },
    "reservationFor": {
      "@type": "Event",
      "name": data.tour + " - Seaduced Experience",
      "startDate": isoDate,
      "location": {
        "@type": "Place",
        "name": t.locationVal,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Havnegade 1",
          "addressLocality": "København",
          "addressRegion": "Hovedstaden",
          "postalCode": "1058",
          "addressCountry": "DK"
        }
      }
    }
  };
  
  return '<script type="application/ld+json">' + JSON.stringify(json) + '</script>';
}

/**
 * FUNCIÓN PARA FORZAR LA VENTANA DE PERMISOS
 * Selecciónala en el desplegable de arriba y dale a "Ejecutar"
 */
function autorizar_script() {
  var email = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(email, "Activación de permisos", "Los permisos de envío de email han sido activados correctamente.");
  Logger.log("Permisos activados para: " + email);
}


function isSpanish(lang) { return lang === 'spanish'; }
function isDanish(lang) { return lang === 'danish'; }

/**
 * Centralized translations for English, Spanish, and Danish
 */
function getTranslations(lang) {
  var map = {
    english: {
      subject: "Your Seaduced Experience is Confirmed!",
      intro: "Hello {name},",
      body: "Your booking for <b>{tour}</b> has been successfully confirmed. We are thrilled to have you on board!",
      details: "Booking Details:",
      tour: "Tour:",
      date: "Date:",
      time: "Time:",
      passengers: "Passengers:",
      extras: "Extras:",
      location: "Departure Point:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Open in Google Maps",
      footer: "If you have any questions, feel free to contact us via WhatsApp or reply to this email.",
      thanks: "See you soon!"
    },
    spanish: {
      subject: "¡Tu Seaduced Experience está Confirmada!",
      intro: "Hola {name},",
      body: "Tu reserva para <b>{tour}</b> ha sido confirmada con éxito. ¡Estamos encantados de tenerte a bordo!",
      details: "Detalles de la reserva:",
      tour: "Tour:",
      date: "Fecha:",
      time: "Hora:",
      passengers: "Pasajeros:",
      extras: "Extras:",
      location: "Punto de salida:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Abrir en Google Maps",
      footer: "Si tienes alguna pregunta, no dudes en contactarnos por WhatsApp o respondiendo a este email.",
      thanks: "¡Nos vemos pronto!"
    },
    danish: {
      subject: "Din Seaduced Experience er Bekræftet!",
      intro: "Hej {name},",
      body: "Din booking for <b>{tour}</b> er blevet bekræftet. Vi glæder os til at se dig om bord!",
      details: "Bookingdetaljer:",
      tour: "Tour:",
      date: "Dato:",
      time: "Tidspunkt:",
      passengers: "Passagerer:",
      extras: "Extras:",
      location: "Afgangssted:",
      locationVal: "Havnegade 1, 1058 København, Denmark",
      mapButton: "Åbn i Google Maps",
      footer: "Hvis du har spørgsmål, er du velkommen til at kontakte os via WhatsApp eller svare på denne e-mail.",
      thanks: "Vi ses snart!"
    }
  };
  return map[lang] || map.english;
}

/**
 * Sends confirmation email to the guest and notification to the owner
 */
function sendBookingEmails(data, t, start, end) {
  var lang = data.lang || 'english';
  if (!t) t = getTranslations(lang);

  // 1. Prepare HTML Content
  var htmlBody = getHtmlTemplate(data, t);
  
  // 2. Prepare ICS Attachment
  var icsBlob;
  try {
    var title = "Seaduced: " + data.tour;
    var location = t.locationVal;
    var description = t.body.replace("<b>", "").replace("</b>", "") + "\n\n" + 
                      t.tour + " " + data.tour + "\n" +
                      t.date + " " + data.date + "\n" +
                      t.time + " " + data.time;
    icsBlob = createIcsBlob(title, start, end, description, location);
  } catch (e) {
    Logger.log("ICS Generation Error: " + e.toString());
  }

  // 3. Send to Guest
  if (data.email) {
    var guestOptions = {
      name: "Seaduced Experience",
      htmlBody: htmlBody
    };
    if (icsBlob) guestOptions.attachments = [icsBlob];
    
    GmailApp.sendEmail(data.email, "Seaduced Experience - " + t.subject, "", guestOptions);
  }

  // 4. Send to Admin (Owner)
  var adminEmail = Session.getEffectiveUser().getEmail();
  if (!adminEmail) adminEmail = data.email; 
  
  var adminSubject = "[NUEVA RESERVA] " + data.tour + " - " + data.name;
  var adminHtml = "<h3>Tienes una nueva solicitud de reserva</h3>" +
                  "<p><b>CLIENTE:</b> " + data.name + "<br>" +
                  "<b>EMAIL:</b> " + data.email + "<br>" +
                  "<b>TELÉFONO:</b> " + (data.phone || "-") + "</p>" +
                  "<hr>" + htmlBody;

  var adminOptions = {
    name: "Seaduced Booking System",
    htmlBody: adminHtml
  };
  if (icsBlob) adminOptions.attachments = [icsBlob];

  GmailApp.sendEmail(adminEmail, adminSubject, "", adminOptions);
}

/**
 * Universal iCalendar (.ics) Generator
 */
function createIcsBlob(title, start, end, description, location) {
  var ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seaduced Experience//NONSGML v1.0//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:" + Utilities.getUuid(),
    "DTSTAMP:" + formatDateToIcs(new Date()),
    "DTSTART:" + formatDateToIcs(start),
    "DTEND:" + formatDateToIcs(end),
    "SUMMARY:" + title,
    "DESCRIPTION:" + description.replace(/\n/g, "\\n"),
    "LOCATION:" + location,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder - Seaduced Experience",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  
  return Utilities.newBlob(ics, "text/calendar", "invite.ics");
}

function formatDateToIcs(date) {
  return Utilities.formatDate(date, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Premium HTML Template for confirmation emails
 */
function getHtmlTemplate(data, t) {
  var accentColor = "#D4AF37"; // Gold / Luxury accent
  var bgColor = "#f8f9fa";
  var navyColor = "#0f1e35"; // From --clr-navy
  
  return `
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
      ${getJsonLdMarkup(data, t)}
    </head>
    <div style="font-family: 'Inter', system-ui, sans-serif; background-color: ${bgColor}; padding: 40px 10px; color: #1a1a1a;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #eee;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${navyColor} 0%, #333 100%); padding: 30px; text-align: center;">
          <h1 style="font-family: 'Playfair Display', serif; color: ${accentColor}; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">SEADUCED</h1>
          <p style="font-family: 'Inter', sans-serif; color: #999; margin: 5px 0 0 0; font-size: 11px; letter-spacing: 3px; font-weight: 400; text-transform: uppercase;">Luxury Boat Experience</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px 30px;">
          <h2 style="font-family: 'Playfair Display', serif; margin-top: 0; font-weight: 700; font-size: 24px; color: ${navyColor};">${t.intro.replace("{name}", data.name)}</h2>
          <p style="font-family: 'Inter', sans-serif; line-height: 1.6; color: #444; font-size: 15px;">${t.body.replace("{tour}", data.tour)}</p>
          
          <div style="background: ${bgColor}; border-radius: 12px; padding: 25px; margin: 30px 0; border: 1px dashed #ddd;">
            <h3 style="font-family: 'Inter', sans-serif; margin-top: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 20px; font-weight: 600;">${t.details}</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif;">
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.tour}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.tour}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.date}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.date}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.time}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.time}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.passengers}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.qty || 1}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888; font-size: 14px;">${t.extras}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 600; color: ${navyColor};">${data.tapas || 0} Tapas/Charcuterie</td>
              </tr>
              <tr>
                <td style="padding: 15px 0 8px 0; color: #888; font-size: 14px;">${t.location}</td>
                <td style="padding: 15px 0 8px 0; text-align: right; font-weight: 600; color: ${accentColor}; font-size: 13px;">
                  ${t.locationVal}<br>
                  <a href="https://share.google/CRsObwvGX3UAhmAgO" style="display: inline-block; background-color: ${navyColor}; color: #ffffff; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; margin-top: 8px; letter-spacing: 0.3px;">
                    📍 ${t.mapButton}
                  </a>
                </td>
              </tr>
            </table>
          </div>

          <p style="font-family: 'Playfair Display', serif; text-align: center; margin-top: 30px; font-weight: 700; font-size: 18px; color: ${navyColor};">${t.thanks}</p>
        </div>

        <!-- Footer -->
        <div style="font-family: 'Inter', sans-serif; padding: 30px; background: #fafafa; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999;">
          <p style="margin: 0;">${t.footer}</p>
          <div style="margin-top: 20px;">
            <a href="https://seaducedexperience.com" style="color: ${accentColor}; text-decoration: none; font-weight: 600; letter-spacing: 1px;">SEADUCEDEXPERIENCE.COM</a>
          </div>
        </div>
      </div>
      
      <div style="font-family: 'Inter', sans-serif; text-align: center; padding-top: 20px; font-size: 10px; color: #aaa; letter-spacing: 0.5px;">
        © 2026 SEADUCED EXPERIENCE COPENHAGEN. ALL RIGHTS RESERVED.
      </div>
    </div>
  `;
}

/**
 * Schema.org JSON-LD for Gmail Smart Banners
 */
function getJsonLdMarkup(data, t) {
  var isoDate = data.date + "T" + data.time + ":00";
  
  var json = {
    "@context": "http://schema.org",
    "@type": "EventReservation",
    "reservationNumber": "SEAD-" + Date.now().toString().slice(-6),
    "reservationStatus": "http://schema.org/Confirmed",
    "underName": {
      "@type": "Person",
      "name": data.name
    },
    "reservationFor": {
      "@type": "Event",
      "name": data.tour + " - Seaduced Experience",
      "startDate": isoDate,
      "location": {
        "@type": "Place",
        "name": t.locationVal,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Havnegade 1",
          "addressLocality": "København",
          "addressRegion": "Hovedstaden",
          "postalCode": "1058",
          "addressCountry": "DK"
        }
      }
    }
  };
  
  return '<script type="application/ld+json">' + JSON.stringify(json) + '</script>';
}

/**
 * FUNCIÓN PARA FORZAR LA VENTANA DE PERMISOS
 * Selecciónala en el desplegable de arriba y dale a "Ejecutar"
 */
function autorizar_script() {
  var email = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(email, "Activación de permisos", "Los permisos de envío de email han sido activados correctamente.");
  Logger.log("Permisos activados para: " + email);
}
