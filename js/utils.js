const BOOKING_STORAGE_KEY = "seaduced_booking";

export const TOURS = {
  "book-1h": {
    id: "book-1h",
    title: "City Highlights",
    titleEs: "Lo Mejor de la Ciudad",
    titleDa: "Byens Højdepunkter",
    price: 2499,
    duration: "1 Hour",
    durationEs: "1 Hora",
    durationDa: "1 Time",
    img: "/assets/images/city-highlights/island-brygge-guests.webp",
    url: "/experiences/private-boat-copenhagen/",
    calendar: "boat1",
  },
  "book-winter": {
    id: "book-winter",
    title: "2-Hour Winter Hygge 2026",
    titleEs: "2 Horas de Hygge Invernal 2026",
    titleDa: "2-timers Vinter Hygge 2026",
    price: 4999,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/winter-seasonal/tour_winter_hygge.webp",
    url: "/experiences/private-boat-copenhagen-3h/", // Placeholder until real path confirmed
    calendar: "boat1",
  },
  "book-reffen": {
    id: "book-reffen",
    title: "Private 3-Hour Extended (Reffen)",
    titleEs: "Puerto Extendido (Parada en Reffen)",
    titleDa: "Privat 3-timers Udvidelse (Reffen)",
    price: 4299,
    duration: "3 Hours",
    durationEs: "3 Horas",
    durationDa: "3 Timer",
    img: "/assets/images/reffen-3h/bote-reffen.webp",
    url: "/experiences/private-boat-copenhagen-3h/",
    calendar: "boat1",
  },
  "book-premium": {
    id: "book-premium",
    title: "Sea Fortress & Coastal Journey (4-Hour)",
    titleEs: "Fortaleza Marina y Viaje Costero",
    titleDa: "Søfæstning & Kystrejse",
    price: 5999,
    duration: "4 Hours",
    durationEs: "4 Horas",
    durationDa: "4 Timer",
    img: "/assets/images/sea-fortress-4h/black-diamond-guests.webp",
    url: "/experiences/private-boat-copenhagen-4h/",
    calendar: "boat1",
  },
  "book-winter-captain": {
    id: "book-winter-captain",
    title: "Private Boat Tour with Captain",
    titleEs: "Tour Privado en Barco con Capitán",
    titleDa: "Privat bådtur med kaptajn",
    price: 2499,
    duration: "1 Hour",
    durationEs: "1 Hora",
    durationDa: "1 Time",
    img: "/assets/images/city-highlights/island-brygge-guests.webp",
    url: "/experiences/private-boat-copenhagen/",
    calendar: "boat1",
  },
  "book-winter-hygge": {
    id: "book-winter-hygge",
    title: "Private Hygge Winter Tour",
    titleEs: "Tour Privado de Invierno Hygge",
    titleDa: "Privat Hygge Vintertur",
    price: 4999,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/winter-seasonal/tour_winter_hygge_book.webp",
    url: "/experiences/private-boat-copenhagen-3h/",
    calendar: "boat1",
  },
  "book-christmas": {
    id: "book-christmas",
    title: "Christmas Tour w. Tapas & Champagne",
    titleEs: "Tour Navideño con Tapas y Champagne",
    titleDa: "Juletur m. Tapas & Champagne",
    price: 5999,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/winter-seasonal/tour_christmas_champagne.webp",
    url: "/experiences/private-boat-copenhagen-3h/",
    calendar: "boat1",
  },
  "book-malmo": {
    id: "book-malmo",
    title: "Copenhagen to Malmö Experience",
    titleEs: "Experiencia de Copenhague a Malmö",
    titleDa: "København til Malmø Oplevelse",
    price: 13000,
    duration: "7 Hours",
    durationEs: "7 Horas",
    durationDa: "7 Timer",
    img: "/assets/images/malmo/tour_malmo.webp",
    url: "/experiences/private-boat-copenhagen-malmo/",
    maxParticipants: 10,
    calendar: "boat2",
  },
  "book-land": {
    id: "book-land",
    title: "Copenhagen Private Boat y Land Experience",
    titleEs: "Escapada por Tierra y Mar",
    titleDa: "København Privat Båd & Landoplevelse",
    price: 8999,
    duration: "5 Hours",
    durationEs: "5 Horas",
    durationDa: "5 Timer",
    img: "/assets/images/land-tour/helsingor.png",
    url: "/experiences/private-boat-copenhagen-land-tour/",
    maxParticipants: 6,
    calendar: "boat1",
  },
  "book-wine": {
    id: "book-wine",
    title: "Floating Wine Tasting Experience",
    titleEs: "Cata de Vinos Flotante",
    titleDa: "Flydende Vinsmagning",
    price: 3499,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/wine-tour/wine-tour-guests.png",
    url: "/experiences/private-boat-copenhagen-wine-tour/",
    maxParticipants: 6,
    calendar: "boat1",
  },
  "book-10p": {
    id: "book-10p",
    title: "City Highlights (10 Guests)",
    titleEs: "Lo Mejor de la Ciudad (10 Personas)",
    titleDa: "Byens Højdepunkter (10 Gæster)",
    price: 2999,
    duration: "1 Hour",
    durationEs: "1 Hora",
    durationDa: "1 Time",
    img: "/assets/images/city-highlights-10/city-highlights-10.webp",
    url: "/experiences/city-highlights-10-people/",
    maxParticipants: 10,
    calendar: "boat2",
  },
  "book-1h-2h": {
    id: "book-1h-2h",
    title: "City Highlights (2 Hours)",
    titleEs: "Lo Mejor de la Ciudad (2 Horas)",
    titleDa: "Byens Højdepunkter (2 Timer)",
    price: 4299,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/city-highlights/island-brygge-guests.webp",
    url: "/experiences/private-boat-copenhagen/",
    calendar: "boat1",
  },
  "book-10p-2h": {
    id: "book-10p-2h",
    title: "City Highlights (10 Guests) (2 Hours)",
    titleEs: "Lo Mejor de la Ciudad (10 Personas) (2 Horas)",
    titleDa: "Byens Højdepunkter (10 Gæster) (2 Timer)",
    price: 4999,
    duration: "2 Hours",
    durationEs: "2 Horas",
    durationDa: "2 Timer",
    img: "/assets/images/city-highlights-10/city-highlights-10.webp",
    url: "/experiences/city-highlights-10-people/",
    maxParticipants: 10,
    calendar: "boat2",
  },
};

export const EXTRA_CHARCUTERIE = {
  title: "Charcuterie",
  titleEs: "Tabla de Charcutería Gourmet",
  price: 225,
  img: "/assets/images/winter-seasonal/tour_christmas_champagne.webp",
};

function getDefaultBooking() {
  const path = window.location.pathname;
  const isSpanish = path.startsWith('/es/') || path === '/es/reserve' || path === '/es';
  const isDanish = path.startsWith('/da/') || path === '/da/reserve' || path === '/da';

  return {
    tour: null,
    qty: 1,
    tapas: 0,
    date: "",
    time: "",
    lang: isSpanish ? "spanish" : (isDanish ? "danish" : "english"),
    contact: {
      name: "",
      email: "",
    },
  };
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBooking(input = {}) {
  const defaults = getDefaultBooking();
  const contact = {
    ...defaults.contact,
    ...(input.contact || {}),
  };

  const next = {
    ...defaults,
    ...input,
    contact,
  };

  next.tour = next.tour && TOURS[next.tour] ? next.tour : defaults.tour;
  next.qty = Math.min(12, Math.max(1, toPositiveInt(next.qty, defaults.qty)));
  next.tapas = Math.max(0, toPositiveInt(next.tapas, defaults.tapas));

  const allowedLangs = ["english", "spanish", "danish"];
  next.lang = allowedLangs.includes(next.lang) ? next.lang : "english";
  next.date = typeof next.date === "string" ? next.date : "";
  next.time = typeof next.time === "string" ? next.time : "";
  next.contact.name = typeof next.contact.name === "string" ? next.contact.name : "";
  next.contact.email = typeof next.contact.email === "string" ? next.contact.email : "";

  return next;
}

export function getBooking() {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_STORAGE_KEY);
    if (!raw) {
      return getDefaultBooking();
    }

    return normalizeBooking(JSON.parse(raw));
  } catch {
    return getDefaultBooking();
  }
}

export function saveBooking(partial = {}) {
  const current = getBooking();
  const merged = normalizeBooking({
    ...current,
    ...partial,
    contact: {
      ...current.contact,
      ...(partial.contact || {}),
    },
  });

  window.sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export const saveBookingPersistent = (booking) => {
  localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(booking));
};

export function clearBookingSelection() {
  const current = getBooking();
  saveBookingPersistent({ ...current, date: "", time: "" });
  return saveBooking({
    tour: null,
    qty: 1,
    tapas: 0,
    date: "",
    lang: "english",
  });
}

// --- ELITE PERSISTENT AVAILABILITY CACHE ---
const AVAIL_CACHE_KEY = "seaduced_avail_cache";

export const getPersistentCache = (calendarId) => {
  try {
    const fullCache = JSON.parse(localStorage.getItem(AVAIL_CACHE_KEY)) || {};
    return fullCache[calendarId] || {};
  } catch (e) { return {}; }
};

export const savePersistentCache = (calendarId, data) => {
  try {
    const fullCache = JSON.parse(localStorage.getItem(AVAIL_CACHE_KEY)) || {};
    fullCache[calendarId] = { ...fullCache[calendarId], ...data, _ts: Date.now() };
    localStorage.setItem(AVAIL_CACHE_KEY, JSON.stringify(fullCache));
  } catch (e) { /* ignore */ }
};

export function getTour(tourId) {
  return TOURS[tourId] || null;
}

export function formatCurrency(value) {
  return `${Math.round(value).toLocaleString()} DKK`;
}

export function readBookingFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const partial = {};

  if (params.get("tour")) partial.tour = params.get("tour");
  if (params.get("qty")) partial.qty = params.get("qty");
  if (params.get("tapas")) partial.tapas = params.get("tapas");
  if (params.get("date")) partial.date = params.get("date");
  if (params.get("time")) partial.time = params.get("time");
  if (params.get("lang")) partial.lang = params.get("lang");

  return normalizeBooking(partial);
}

export function buildReserveUrl(booking = getBooking()) {
  const params = new URLSearchParams();
  const path = window.location.pathname;
  const isSpanish = path.startsWith('/es/') || path === '/es';
  const isDanish = path.startsWith('/da/') || path === '/da';

  if (booking.tour) params.set("tour", booking.tour);
  params.set("qty", String(booking.qty || 1));
  params.set("tapas", String(booking.tapas || 0));

  if (booking.date) params.set("date", booking.date);
  if (booking.time) params.set("time", booking.time);
  if (booking.lang) params.set("lang", booking.lang);

  let prefix = "";
  if (isSpanish) prefix = "/es";
  else if (isDanish) prefix = "/da";

  return `${prefix}/reserve?${params.toString()}`;
}

export function navigateToReserve(tourId, overrides = {}) {
  const next = saveBooking({
    tour: tourId,
    qty: overrides.qty ?? 1,
    tapas: overrides.tapas ?? getBooking().tapas ?? 0,
    date: overrides.date ?? getBooking().date ?? "",
    time: overrides.time ?? getBooking().time ?? "",
    lang: overrides.lang ?? getBooking().lang ?? "english",
  });

  window.location.href = buildReserveUrl(next);
}

export function getLocalizedValue(item, key, lang) {
  let suffix = "";
  if (lang === "spanish") suffix = "Es";
  else if (lang === "danish") suffix = "Da";

  const localizedKey = suffix ? `${key}${suffix}` : key;
  return item[localizedKey] || item[key];
}
