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
  
  // ADD GUEST: This triggers the "Yes/No/Maybe" invitation in most calendars
  if (data.email) {
    try {
      event.addGuest(data.email);
    } catch (e) {
      Logger.log("Could not add guest: " + e.toString());
    }
  }
  
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
      locationVal: "Puerto Banús, Marbella",
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
      locationVal: "Puerto Banús, Marbella",
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
      locationVal: "Puerto Banús, Marbella",
      footer: "Hvis du har spørgsmål, er du velkommen til at kontakte os via WhatsApp eller svare på denne e-mail.",
      thanks: "Vi ses snart!"
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

  // 1. Prepare HTML Content
  var htmlBody = getHtmlTemplate(data, t);

  // 2. Send to Guest
  if (data.email) {
    GmailApp.sendEmail(data.email, "Seaduced Experience - " + t.subject, "", {
      name: "Seaduced Experience",
      htmlBody: htmlBody
    });
  }

  // 3. Send to Admin (Owner) - We keep a simpler version or same HTML
  var adminEmail = Session.getEffectiveUser().getEmail();
  if (!adminEmail) adminEmail = data.email; 
  
  var adminSubject = "[NUEVA RESERVA] " + data.tour + " - " + data.name;
  var adminHtml = "<h3>Tienes una nueva solicitud de reserva</h3>" +
                  "<p><b>CLIENTE:</b> " + data.name + "<br>" +
                  "<b>EMAIL:</b> " + data.email + "<br>" +
                  "<b>TELÉFONO:</b> " + (data.phone || "-") + "</p>" +
                  "<hr>" + htmlBody;

  GmailApp.sendEmail(adminEmail, adminSubject, "", {
    name: "Seaduced Booking System",
    htmlBody: adminHtml
  });
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
                <td style="padding: 15px 0 8px 0; text-align: right; font-weight: 600; color: ${accentColor};">${t.locationVal}</td>
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
        © 2026 SEADUCED EXPERIENCE MARBELLA. ALL RIGHTS RESERVED.
      </div>
    </div>
  `;
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
