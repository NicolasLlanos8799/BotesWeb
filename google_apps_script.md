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
  
  var title = "[PENDING] " + data.tour + " - " + data.name;
  var description = "TOUR: " + data.tour + "\nDATE: " + data.date + "\nTIME: " + data.time + "\n\nCONTACT:\n" + data.name + "\n" + data.email + "\n" + (data.phone || "-");
                    
  var event = calendar.createEvent(title, start, end, { description: description });
  return { success: true, eventId: event.getId() };
}
