/**
 * SEADUCED EXPERIENCE - GOOGLE CALENDAR BRIDGE (V6.0 - Monthly Sync)
 * 
 * Instructions:
 * 1. Go to https://script.google.com
 * 2. Click "Manage Deployments" -> Pencil Icon -> Version: "New Version" -> "Deploy".
 * 3. This version supports monthly pre-fetching for instant UI updates.
 */

var START_HOUR = 9;   
var END_HOUR = 16;    
var DEFAULT_DURATION = 1; 

function doGet(e) {
  var action = e.parameter.action;
  var callback = e.parameter.callback;
  var responseData;

  if (action === 'getMonthlyAvailability') {
    responseData = handleMonthlyAvailability(e.parameter.date);
  } else if (action === 'getAvailability') {
    responseData = handleGetAvailability(e.parameter.date);
  } else if (action === 'createBooking') {
    try {
      var data = JSON.parse(e.parameter.data);
      responseData = handleCreateBooking(data);
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
    var responseData = handleCreateBooking(data);
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
function handleMonthlyAvailability(dateString) {
  var calendar = CalendarApp.getDefaultCalendar();
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

function handleGetAvailability(dateString) {
  var calendar = CalendarApp.getDefaultCalendar();
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
  var calendar = CalendarApp.getDefaultCalendar();
  var durationH = DEFAULT_DURATION;
  if(data.tour && data.tour.includes('2-Hour')) durationH = 2;
  if(data.tour && data.tour.includes('3-Hour')) durationH = 3;

  var parts = data.date.split('-');
  var timeParts = data.time.split(':');
  var start = new Date(parts[0], parts[1]-1, parseInt(parts[2]), parseInt(timeParts[0]), parseInt(timeParts[1]));
  var end = new Date(start.getTime() + (durationH * 60 * 60 * 1000));
  
  var lang = data.lang || 'english';
  var t = getTranslations(lang);
  
  var title = data.tour + " - " + data.name;
  
  // Use translated labels for calendar description too
  var description = t.tour + " " + data.tour + "\n" + 
                    t.date + " " + data.date + "\n" + 
                    t.time + " " + data.time + "\n" +
                    t.passengers + " " + (data.qty || 1) + "\n" +
                    t.extras + " " + (data.tapas || 0) + "\n\n" +
                    (isSpanish(lang) ? "CONTACTO:" : (isDanish(lang) ? "KONTAKT:" : "CONTACT:")) + "\n" + 
                    data.name + "\n" + data.email + "\n" + (data.phone || "-");
                    
  var event = calendar.createEvent(title, start, end, { description: description });
  
  // Send notifications
  try {
    sendBookingEmails(data, t);
  } catch (e) {
    // If email fails, we update the calendar event description with the error
    var errorMsg = "\n\n[ERROR DE EMAIL]: " + e.toString();
    event.setDescription(description + errorMsg);
  }

  return { success: true, eventId: event.getId() };
}

function isSpanish(lang) { return lang === 'spanish'; }
function isDanish(lang) { return lang === 'danish'; }

/**
 * Centralized translations for English, Spanish, and Danish
 */
function getTranslations(lang) {
  var map = {
    english: {
      subject: "Booking Confirmed!",
      intro: "Hello {name},\n\nYour booking for {tour} has been successfully confirmed. We are looking forward to seeing you on board!",
      details: "Booking Details:",
      tour: "Tour:",
      date: "Date:",
      time: "Time:",
      passengers: "Passengers:",
      extras: "Extras (Tapas/Charcuterie):",
      footer: "\nIf you have any questions, feel free to contact us.\nThank you for choosing Seaduced Experience!"
    },
    spanish: {
      subject: "¡Reserva Confirmada!",
      intro: "Hola {name},\n\nTu reserva para {tour} ha sido confirmada con éxito. ¡Estamos deseando verte a bordo!",
      details: "Detalles de la reserva:",
      tour: "Tour:",
      date: "Fecha:",
      time: "Hora:",
      passengers: "Pasajeros:",
      extras: "Extras (Tapas/Charcutería):",
      footer: "\nSi tienes alguna pregunta, no dudes en contactarnos.\n¡Gracias por elegir Seaduced Experience!"
    },
    danish: {
      subject: "Booking Bekræftet!",
      intro: "Hej {name},\n\nDin booking for {tour} er blevet bekræftet. Vi glæder os til at se dig om bord!",
      details: "Bookingdetaljer:",
      tour: "Tour:",
      date: "Dato:",
      time: "Tidspunkt:",
      passengers: "Passagerer:",
      extras: "Extras (Tapas/Charcuterie):",
      footer: "\nHvis du har spørgsmål, er du velkommen til at kontakte os.\nTak for at vælge Seaduced Experience!"
    }
  };
  return map[lang] || map.english;
}

/**
 * Sends confirmation email to the guest and notification to the owner
 */
function sendBookingEmails(data, t) {
  var lang = data.lang || 'english';
  if (!t) t = getTranslations(lang);

  var intro = t.intro.replace("{name}", data.name).replace("{tour}", data.tour);

  var body = intro + "\n\n" +
             t.details + "\n" +
             "--------------------------\n" +
             t.tour + " " + data.tour + "\n" +
             t.date + " " + data.date + "\n" +
             t.time + " " + data.time + "\n" +
             t.passengers + " " + (data.qty || 1) + "\n" +
             t.extras + " " + (data.tapas || 0) + "\n" +
             "--------------------------\n" +
             t.footer;

  // 1. Send to Guest
  if (data.email) {
    GmailApp.sendEmail(data.email, "Seaduced Experience - " + t.subject, body, {
      name: "Seaduced Experience"
    });
  }

  // 2. Send to Admin (Owner)
  var adminEmail = Session.getEffectiveUser().getEmail();
  if (!adminEmail) adminEmail = data.email; // Fallback to guest if owner email is hidden
  
  var adminSubject = "[NUEVA RESERVA] " + data.tour + " - " + data.name;
  var adminBody = "Tienes una nueva solicitud de reserva pendiente:\n\n" +
                  "CLIENTE: " + data.name + "\n" +
                  "EMAIL: " + data.email + "\n" +
                  "TELÉFONO: " + (data.phone || "-") + "\n\n" +
                  t.details + "\n" +
                  "--------------------------\n" +
                  t.tour + " " + data.tour + "\n" +
                  t.date + " " + data.date + "\n" +
                  t.time + " " + data.time + "\n" +
                  t.passengers + " " + (data.qty || 1) + "\n" +
                  t.extras + " " + (data.tapas || 0) + "\n" +
                  "--------------------------\n";

  GmailApp.sendEmail(adminEmail, adminSubject, adminBody, {
    name: "Seaduced Booking System"
  });
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
