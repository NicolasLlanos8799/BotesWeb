const BOOKING_STORAGE_KEY = "seaduced_booking";

export const TOURS = {
  "book-1h": {
    id: "book-1h",
    title: "Private Guided Boat Tour",
    price: 2499,
    duration: "1 Hour",
    img: "/assets/images/tour_private_boat.png",
  },
  "book-winter": {
    id: "book-winter",
    title: "2-Hour Winter Hygge 2026",
    price: 4999,
    duration: "2 Hours",
    img: "/assets/images/tour_winter_hygge.webp",
  },
  "book-reffen": {
    id: "book-reffen",
    title: "Private 3-Hour Extended (Reffen)",
    price: 4299,
    duration: "3 Hours",
    img: "/assets/images/tour_sunset_boat.png",
  },
  "book-premium": {
    id: "book-premium",
    title: "Private 4-Hour Premium Experience",
    price: 5999,
    duration: "4 Hours",
    img: "/assets/images/tour_trekroner.png",
  },
  "book-winter-captain": {
    id: "book-winter-captain",
    title: "Private Boat Tour with Captain",
    price: 2499,
    duration: "1 Hour",
    img: "/assets/images/tour_private_boat.png",
  },
  "book-winter-hygge": {
    id: "book-winter-hygge",
    title: "Private Hygge Winter Tour",
    price: 4999,
    duration: "2 Hours",
    img: "/assets/images/tour_winter_hygge_book.webp",
  },
  "book-christmas": {
    id: "book-christmas",
    title: "Christmas Tour w. Tapas & Champagne",
    price: 5999,
    duration: "2 Hours",
    img: "/assets/images/tour_christmas_champagne.webp",
  },
};

export const EXTRA_CHARCUTERIE = {
  title: "Charcuterie",
  price: 225,
  img: "/assets/images/tour_christmas_champagne.webp",
};

function getDefaultBooking() {
  return {
    tour: null,
    qty: 1,
    tapas: 0,
    date: "",
    lang: "english",
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
  next.qty = Math.min(8, Math.max(1, toPositiveInt(next.qty, defaults.qty)));
  next.tapas = Math.max(0, toPositiveInt(next.tapas, defaults.tapas));
  next.lang = next.lang === "spanish" ? "spanish" : "english";
  next.date = typeof next.date === "string" ? next.date : "";
  next.contact.name = typeof next.contact.name === "string" ? next.contact.name : "";
  next.contact.email = typeof next.contact.email === "string" ? next.contact.email : "";

  return next;
}

export function getBooking() {
  try {
    const raw = window.localStorage.getItem(BOOKING_STORAGE_KEY);
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

  window.localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearBookingSelection() {
  return saveBooking({
    tour: null,
    qty: 1,
    tapas: 0,
    date: "",
    lang: "english",
  });
}

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
  if (params.get("lang")) partial.lang = params.get("lang");

  return normalizeBooking(partial);
}

export function buildReserveUrl(booking = getBooking()) {
  const params = new URLSearchParams();

  if (booking.tour) params.set("tour", booking.tour);
  params.set("qty", String(booking.qty || 1));
  params.set("tapas", String(booking.tapas || 0));

  if (booking.date) params.set("date", booking.date);
  if (booking.lang) params.set("lang", booking.lang);

  return `/reserve?${params.toString()}`;
}

export function navigateToReserve(tourId, overrides = {}) {
  const next = saveBooking({
    tour: tourId,
    qty: overrides.qty ?? 1,
    tapas: overrides.tapas ?? getBooking().tapas ?? 0,
    date: overrides.date ?? getBooking().date ?? "",
    lang: overrides.lang ?? getBooking().lang ?? "english",
  });

  window.location.href = buildReserveUrl(next);
}
