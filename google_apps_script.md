/**
 * Google Apps Script for Seaduced Experience
 * Handles Booking Creation and Status Updates
 */

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'getAvailability') {
    return handleGetAvailability(e.parameter.calendar, e.parameter.date);
  }
  if (action === 'getMonthlyAvailability') {
    return handleGetMonthlyAvailability(e.parameter.calendar, e.parameter.month, e.parameter.year);
  }
  return ContentService.createTextOutput("Action not found").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = e.parameter.action;
    var result;

    if (action === 'createBooking') {
      result = handleCreateBooking(data);
    } else {
      result = { success: false, error: "Action not recognized" };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Maps friendly names to Calendar IDs
 */
function getCalendar(name) {
  var map = {
    'boat1': 'c_557550302cc8897c5553e18086054817117c2f829ec7687980315a6b0c2a297e@group.calendar.google.com',
    'boat2': 'c_0df697c1d769c3a37b60706212e3e970a66d039f37c3da43685f67a211470550@group.calendar.google.com'
  };
  var id = map[name] || map['boat1'];
  return CalendarApp.getCalendarById(id);
}

/**
 * Returns available slots for a specific date
 */
function handleGetAvailability(calendarName, dateStr) {
  var calendar = getCalendar(calendarName);
  var day = new Date(dateStr);
  
  var startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0);
  var endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21, 0, 0);
  
  var events = calendar.getEvents(startOfDay, endOfDay);
  var busySlots = events.map(function(e) {
    return {
      start: e.getStartTime().getHours(),
      end: e.getEndTime().getHours()
    };
  });
  
  return ContentService.createTextOutput(JSON.stringify({ busy: busySlots }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Returns busy days for a whole month
 */
function handleGetMonthlyAvailability(calendarName, month, year) {
  var calendar = getCalendar(calendarName);
  var startOfMonth = new Date(year, month - 1, 1);
  var endOfMonth = new Date(year, month, 0, 23, 59, 59);
  
  var events = calendar.getEvents(startOfMonth, endOfMonth);
  var busyDays = {};
  
  events.forEach(function(e) {
    var date = e.getStartTime().getDate();
    busyDays[date] = true;
  });
  
  return ContentService.createTextOutput(JSON.stringify({ busyDays: Object.keys(busyDays).map(Number) }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Creates a booking event in the calendar
 * NOW: Only called when paid (either via Webhook or Success page)
 */
function handleCreateBooking(data) {
  var calendar = getCalendar(data.calendar || 'boat1');
  
  // 1. DEDUPLICACIÓN: Comprobar si ya existe una reserva con este SumUp ID
  if (data.sumup_checkout_id && data.sumup_checkout_id !== 'N/A') {
    var existingEvent = findEventBySumUpId(data.sumup_checkout_id);
    if (existingEvent) {
      Logger.log("Reserva duplicada detectada (SumUp ID: " + data.sumup_checkout_id + "). Ignorando.");
      return { success: true, message: "Duplicate avoided", eventId: existingEvent.getId() };
    }
  }

  // 2. Definir horarios
  var durationH = 1;
  var tour = data.tour || data.tourTitle || "";
  if(tour.includes('1-Hour') || tour.includes('Highlights') || tour.includes('book-1h')) durationH = 1;
  if(tour.includes('Floating Wine')) durationH = 2;
  if(tour.includes('3-Hour')) durationH = 3;
  if(tour.includes('4-Hour')) durationH = 4;
  if(tour.includes('Malmö')) durationH = 7;

  var dateParts = data.date.split('-');
  var timeParts = data.time.split(':');
  var start = new Date(dateParts[0], dateParts[1]-1, dateParts[2], timeParts[0], timeParts[1]);
  var end = new Date(start.getTime() + durationH * 60 * 60 * 1000);

  // 3. Formatear datos
  var status = data.payment_status || 'PAID';
  var title = "Reserva: " + (data.name || 'Cliente');
  
  var description = 
    "Status: " + status + "\n" +
    "SumUp ID: " + (data.sumup_checkout_id || "N/A") + "\n" +
    "Tour: " + tour + "\n" +
    "Date: " + data.date + "\n" +
    "Time: " + (data.time || "N/A") + "\n" +
    "Passengers: " + (data.qty || "N/A") + "\n" +
    "Language: " + (data.lang || "N/A") + "\n" +
    "Extras: " + (data.tapas && data.tapas != "0" ? data.tapas + " Tapas/Charcuterie" : "None") + "\n\n" +
    "--- Customer Info ---\n" +
    "Name: " + (data.name || "N/A") + "\n" +
    "Email: " + (data.email || "N/A") + "\n" +
    "Phone: " + (data.phone || "N/A");

  // 4. Crear evento directamente en Dorado
  var event = calendar.createEvent(title, start, end, {
    description: description
  });
  event.setColor(CalendarApp.EventColor.PALE_GOLD);
  
  var lang = data.lang || 'english';
  var t = getTranslations(lang);
  
  // 5. ENVIAR EMAIL Y AÑADIR GUEST (Solo si está pagado o es el flujo limpio)
  if (status === 'PAID' || status === 'paid') {
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
  }

  return { success: true, eventId: event.getId(), status: status };
}

/**
 * Helper to find existing events by SumUp ID in the description
 */
function findEventBySumUpId(sumupId) {
  var calendars = [
    getCalendar('boat1'),
    getCalendar('boat2')
  ];
  var now = new Date();
  var future = new Date();
  future.setMonth(now.getMonth() + 12);
  
  for (var i = 0; i < calendars.length; i++) {
    var events = calendars[i].getEvents(now, future);
    for (var j = 0; j < events.length; j++) {
      var desc = events[j].getDescription();
      if (desc && desc.indexOf("SumUp ID: " + sumupId) !== -1) {
        return events[j];
      }
    }
  }
  return null;
}

/**
 * Centralized translations
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
      footer: "Hvis du har spørgsmål, er du velkommen til at kontakte os via WhatsApp ogh svare på denne e-mail.",
      thanks: "Vi ses snart!"
    }
  };
  return map[lang] || map.english;
}

/**
 * Sends confirmation email
 */
function sendBookingEmails(data, t, start, end) {
  var htmlBody = getHtmlTemplate(data, t);
  var icsBlob = createIcsBlob("Seaduced: " + (data.tour || data.tourTitle), start, end, t.body.replace("<b>","").replace("</b>",""), t.locationVal);

  // To Guest
  if (data.email) {
    GmailApp.sendEmail(data.email, "Seaduced Experience - " + t.subject, "", {
      name: "Seaduced Experience",
      htmlBody: htmlBody,
      attachments: [icsBlob]
    });
  }

  // To Admin
  var adminEmail = Session.getEffectiveUser().getEmail();
  var adminHtml = "<h3>Nueva Reserva Pagada</h3>" + htmlBody;
  GmailApp.sendEmail(adminEmail, "[PAGO CONFIRMADO] " + (data.tour || data.tourTitle), "", {
    name: "Seaduced Web",
    htmlBody: adminHtml
  });
}

function createIcsBlob(title, start, end, description, location) {
  var ics = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\n" +
            "DTSTART:" + Utilities.formatDate(start, "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
            "DTEND:" + Utilities.formatDate(end, "GMT", "yyyyMMdd'T'HHmmss'Z'") + "\n" +
            "SUMMARY:" + title + "\n" +
            "DESCRIPTION:" + description + "\n" +
            "LOCATION:" + location + "\n" +
            "END:VEVENT\nEND:VCALENDAR";
  return Utilities.newBlob(ics, "text/calendar", "invite.ics");
}

function getHtmlTemplate(data, t) {
  var intro = t.intro.replace("{name}", data.name);
  var body = t.body.replace("{tour}", data.tour || data.tourTitle);
  
  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #c9a55c; text-align: center;">Seaduced Experience</h2>
      <p>${intro}</p>
      <p>${body}</p>
      <hr/>
      <h3>${t.details}</h3>
      <p><b>${t.tour}</b> ${data.tour || data.tourTitle}</p>
      <p><b>${t.date}</b> ${data.date}</p>
      <p><b>${t.time}</b> ${data.time}</p>
      <p><b>${t.passengers}</b> ${data.qty}</p>
      <p><b>${t.extras}</b> ${data.tapas && data.tapas != "0" ? data.tapas + " Tapas" : "None"}</p>
      <hr/>
      <p><b>${t.location}</b><br/>${t.locationVal}</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="https://www.google.com/maps/search/?api=1&query=Havnegade+1+1058+Kobenhavn" style="background-color: #c9a55c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">${t.mapButton}</a>
      </div>
      <p style="font-size: 12px; color: #777;">${t.footer}</p>
      <p><b>${t.thanks}</b></p>
    </div>
  `;
}
