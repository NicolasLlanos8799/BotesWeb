/**
 * SEADUCED EXPERIENCE - GOOGLE CALENDAR BRIDGE (V5.0 - JSONP Support)
 * 
 * Instructions:
 * 1. Go to https://script.google.com
 * 2. Click "Manage Deployments" -> Pencil Icon -> Version: "New Version" -> "Deploy".
 * 3. This script uses JSONP to bypass browser CORS restrictions.
 */

var START_HOUR = 9;   
var END_HOUR = 16;    
var DEFAULT_DURATION = 1; 

function doGet(e) {
  var action = e.parameter.action;
  var callback = e.parameter.callback;
  
  var responseData;

  if (action === 'getAvailability') {
    responseData = handleGetAvailability(e.parameter.date);
  } else if (action === 'createBooking') {
    try {
      var data = JSON.parse(e.parameter.data);
      responseData = handleCreateBooking(data);
    } catch (err) {
      responseData = { success: false, error: "JSON Parse error" };
    }
  } else {
    responseData = { message: "Seaduced Bridge V5 Online" };
  }

  // JSONP logic: wrap result in a function call if callback is present
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
    var slotStart = new Date(date.getTime());
    slotStart.setHours(h, 0, 0, 0);
    var slotEnd = new Date(date.getTime());
    slotEnd.setHours(h + DEFAULT_DURATION, 0, 0, 0);
    
    var sStart = slotStart.getTime();
    var sEnd = slotEnd.getTime();
    
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
  return slots;
}

function handleCreateBooking(data) {
  var calendar = CalendarApp.getDefaultCalendar();
  var durationH = DEFAULT_DURATION;
  if(data.tour && data.tour.includes('2-Hour')) durationH = 2;
  if(data.tour && data.tour.includes('3-Hour')) durationH = 3;

  var parts = data.date.split('-');
  var timeParts = data.time.split(':');
  var start = new Date(parts[0], parts[1]-1, parts[2], timeParts[0], timeParts[1]);
  var end = new Date(start.getTime() + (durationH * 60 * 60 * 1000));
  
  var title = "[PENDING] " + data.tour + " - " + data.name;
  var extrasString = (data.tapas && data.tapas > 0) ? (data.tapas + "x Gourmet Charcuterie Box") : "None";
  
  var description = "TOUR: " + data.tour + "\nDATE: " + data.date + "\nTIME: " + data.time + "\nEXTRAS: " + extrasString + "\n\nCONTACT:\n" + data.name + "\n" + data.email + "\n" + (data.phone || "-");
                    
  var event = calendar.createEvent(title, start, end, { description: description });
  return { success: true, eventId: event.getId() };
}
