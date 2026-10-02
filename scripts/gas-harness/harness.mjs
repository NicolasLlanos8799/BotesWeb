/**
 * Regression harness for the Apps Script backends (PROD + DEMO).
 *
 * Loads each AppScript-*-BookingWeb.js in a node `vm` with stubbed Google
 * services, renders every email template in the 3 languages, fires doPost /
 * doGet with every action and runs the trigger functions. Everything observable
 * (responses, emails, calendar state, UrlFetch calls, triggers, logs) is
 * compared byte-for-byte against scripts/gas-harness/snapshots/.
 *
 *   node scripts/gas-harness/harness.mjs            # compare, exit 1 on any diff
 *   node scripts/gas-harness/harness.mjs --update   # rewrite the snapshots
 */

process.env.TZ = 'Europe/Copenhagen';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SNAP_DIR = path.join(HERE, 'snapshots');
const ENVS = { PROD: 'AppScript-PROD-BookingWeb.js', DEMO: 'AppScript-DEMO-BookingWeb.js' };
const FIXED_NOW = Date.parse('2026-10-02T09:00:00Z');
const LANGS = ['english', 'spanish', 'danish'];

/* ───────────────────────── Stubs ───────────────────────── */

class FakeDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(FIXED_NOW); }
  static now() { return FIXED_NOW; }
}

function createSandbox(file, cfg) {
  const rec = { logs: [], gmail: [], fetches: [], triggers: [], locks: [], events: [] };
  let ctx;
  let nextId = 1;

  const makeEvent = (boat, title, start, end, opts) => {
    const ev = {
      id: 'evt-' + (nextId++), boat, title, start, end,
      description: (opts && opts.description) || '',
      location: (opts && opts.location) || '',
      color: '', guests: [], deleted: false
    };
    rec.events.push(ev);
    return wrapEvent(ev);
  };
  const wrapEvent = (ev) => ({
    getId: () => ev.id,
    getTitle: () => ev.title,
    getDescription: () => ev.description,
    getStartTime: () => ev.start,
    getEndTime: () => ev.end,
    getColor: () => ev.color,
    getLocation: () => ev.location,
    getOriginalCalendarId: () => 'cal-' + ev.boat,
    setTitle(v) { ev.title = v; return this; },
    setDescription(v) { ev.description = v; return this; },
    setTime(s, e) { ev.start = s; ev.end = e; return this; },
    setColor(v) { ev.color = v; return this; },
    addGuest(v) { ev.guests.push(v); return this; },
    deleteEvent() { ev.deleted = true; }
  });
  const makeCalendar = (boat) => ({
    getId: () => 'cal-' + boat,
    getName: () => 'Calendar ' + boat,
    getEvents: (start, end) => rec.events
      .filter((ev) => ev.boat === boat && !ev.deleted && ev.start < end && ev.end > start)
      .map(wrapEvent),
    createEvent: (title, start, end, opts) => makeEvent(boat, title, start, end, opts)
  });

  const globals = {
    Date: FakeDate,
    Logger: { log: (m) => { rec.logs.push(String(m)); } },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (content) => ({
        content, mime: null,
        setMimeType(m) { this.mime = m; return this; },
        getContent() { return this.content; }
      })
    },
    CalendarApp: {
      EventColor: {
        PALE_BLUE: '1', PALE_GREEN: '2', MAUVE: '3', PALE_RED: '4', YELLOW: '5', ORANGE: '6',
        CYAN: '7', GRAY: '8', BLUE: '9', GREEN: '10', RED: '11'
      },
      // Calendar IDs differ per environment: resolve them back to the boat name
      // so PROD and DEMO snapshots stay comparable.
      getCalendarById: (id) => {
        const ids = vm.runInContext('CALENDAR_IDS', ctx);
        const boat = Object.keys(ids).find((k) => ids[k] === id);
        return boat ? makeCalendar(boat) : null;
      }
    },
    LockService: {
      getScriptLock: () => ({
        waitLock(ms) { rec.locks.push('waitLock ' + ms); if (cfg.lockTimeout) throw new Error('Lock timeout (stub)'); },
        tryLock(ms) { rec.locks.push('tryLock ' + ms); return true; },
        releaseLock() { rec.locks.push('releaseLock'); }
      })
    },
    GmailApp: {
      sendEmail: (to, subject, body, options) => {
        if (cfg.gmailThrows) throw new Error('Gmail quota exceeded (stub)');
        rec.gmail.push({ to, subject, body, options });
      }
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@harness.test' }) },
    Utilities: {
      formatDate: (date, tz, fmt) => {
        if (tz !== 'GMT' || fmt !== "yyyyMMdd'T'HHmmss'Z'") throw new Error('formatDate stub: unsupported ' + tz + ' ' + fmt);
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      },
      newBlob: (content, type, name) => ({ __blob: true, content, type, name })
    },
    ScriptApp: {
      getProjectTriggers: () => cfg.existingTriggers.map((fn, i) => ({
        getHandlerFunction: () => fn, __id: 'trigger-' + i + ':' + fn
      })),
      deleteTrigger: (t) => { rec.triggers.push({ op: 'delete', trigger: t.__id }); },
      newTrigger: (fn) => {
        const t = { op: 'create', fn };
        const builder = {
          timeBased() { t.type = 'timeBased'; return builder; },
          everyMinutes(n) { t.everyMinutes = n; return builder; },
          create() { rec.triggers.push(t); return {}; }
        };
        return builder;
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (k in cfg.props ? cfg.props[k] : null) })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        rec.fetches.push({ url, options });
        if (cfg.fetchThrows) throw new Error('DNS error (stub)');
        return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
      }
    }
  };

  ctx = vm.createContext(globals);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });

  const at = (dateStr, timeStr) => new FakeDate(dateStr + 'T' + timeStr + ':00');
  return {
    rec,
    has: (name) => vm.runInContext('typeof ' + name, ctx) === 'function',
    call: (name, ...args) => vm.runInContext(name, ctx)(...args),
    post(payload) {
      const contents = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const out = vm.runInContext('doPost', ctx)({ postData: { contents } });
      return { mime: out.mime, body: JSON.parse(out.content) };
    },
    get(parameter) {
      const out = vm.runInContext('doGet', ctx)({ parameter });
      let body = out.content;
      try { body = JSON.parse(out.content); } catch (e) { /* plain text */ }
      return { mime: out.mime, body };
    },
    seed(boat, title, description, color, date, from, to) {
      const ev = makeEvent(boat, title, at(date || '2026-10-15', from || '14:00'), at(date || '2026-10-15', to || '15:00'), { description });
      if (color) ev.setColor(color);
    }
  };
}

/* ───────────────────────── Fixtures ───────────────────────── */

const booking = (over) => Object.assign({
  name: 'Ana García', email: 'ana@example.com', phone: '+45 11 22 33 44',
  tour: 'city-highlights-1h', date: '2026-10-15', time: '14:00', qty: '4',
  lang: 'english', tapas: '2', amount: '1800', currency: 'DKK',
  sumup_checkout_id: 'chk_123'
}, over);

const REVIEW_URL = 'https://seaduced-experience.com/r?b=abc123';
const GYG_CONFIRMED = '✨ City Highlights\nGYG Ref: GYG-1\nSource: GetYourGuide';
const GYG_HOLD = '⏳ GYG HOLD — pending confirmation\nGYG Ref: GYG-1\nSource: GetYourGuide (hold)';
const SUMUP_DESC = '✨ City Highlights\nSumUp ID: chk_123\nStatus: PAID';

const TOUR_CODES = [
  'city-highlights-1h', 'book-1h-2h', 'book-10p', 'book-10p-2h', 'book-wine', 'city-highlights-4h',
  'city-highlights-3h', 'book-malmo', 'book-land', 'book-danish-breakfast', 'book-cocktails-tapas',
  'book-winter', 'book-winter-captain', 'book-winter-hygge', 'book-christmas', 'unknown-code', ''
];
const DURATION_INPUTS = TOUR_CODES.concat([
  'City Highlights (2 Hours)', 'Private 2-Hours', 'Copenhagen 1 Hour', '1-Hour Classic', 'City Highlights',
  'City Highlights with Danish Breakfast', 'Floating Wine Tasting Experience', 'Private 3 Hour', 'Private 3-Hour Extended (Reffen)',
  'Sea Fortress 4 Hour', '4-Hour Coastal', 'Canal Cruise', 'Copenhagen to Malmö Experience', 'Dragør Day', 'Helsingør Day',
  'Private Boat Tour with Cocktails & Tapas'
]);

/* ───────────────────────── Templates ───────────────────────── */

// name → (sandbox, data, lang) => html
const TEMPLATES = {
  guest: (s, d, lang) => s.call('getGuestHtmlTemplate', d, s.call('getTranslations', lang), '15:00'),
  admin: (s, d, lang) => s.call('getAdminHtmlTemplate', d, s.call('getTranslations', lang), '15:00'),
  'payment-failed': (s, d, lang) => s.call('getPaymentFailedHtmlTemplate', d, s.call('getTranslations', lang)),
  'payment-reminder': (s, d, lang) => s.call('getPaymentReminderHtmlTemplate', d, s.call('getTranslations', lang)),
  cancellation: (s, d, lang) => s.call('getCancellationHtmlTemplate', d, s.call('getTranslations', lang)),
  review: (s, d, lang) => s.call('getReviewHtmlTemplate', d, s.call('getTranslations', lang))
};

const TEMPLATE_VARIANTS = {
  full: (lang) => booking({ lang, reviewUrl: REVIEW_URL }),
  titled: (lang) => booking({ lang, reviewUrl: REVIEW_URL, tour: 'book-wine', tourTitle: 'Floating Wine Tasting Experience', tapas: '0', groupNumber: 2 }),
  gyg: (lang) => booking({ lang, reviewUrl: REVIEW_URL, source: 'GetYourGuide', sumup_checkout_id: 'GYG-1', amount: '', tapas: 0 }),
  minimal: (lang) => ({ lang })
};

function renderTemplates(file) {
  const files = {};
  const s = createSandbox(file, defaultCfg());
  for (const lang of LANGS.concat(['german'])) {
    for (const [tpl, render] of Object.entries(TEMPLATES)) {
      for (const [variant, data] of Object.entries(TEMPLATE_VARIANTS)) {
        files[`templates/${tpl}.${variant}.${lang}.html`] = render(s, data(lang), lang);
      }
    }
    files[`templates/rules-block.${lang}.html`] = s.call('getRulesBlock', lang);
  }
  files['templates/guest.no-end-time.english.html'] = s.call('getGuestHtmlTemplate', booking(), s.call('getTranslations', 'english'), '');
  files['templates/otp.html'] = s.call('getOtpHtmlTemplate', '123456');
  return files;
}

/* ───────────────────────── Cases ───────────────────────── */

const CASES = [];
const add = (name, run, cfg) => CASES.push({ name, run, cfg: cfg || {} });
const defaultCfg = () => ({
  gmailThrows: false, fetchThrows: false, lockTimeout: false,
  props: { SITE_URL: 'https://site.harness.test', CRON_SECRET: 'secret-123' },
  existingTriggers: ['checkPendingPaymentReminders', 'checkGygExpireHolds', 'checkPostTourEmails', 'someOtherHandler', 'checkPostTourEmails']
});

// Pure helpers
add('pure/getTranslations', (s) => Object.fromEntries(LANGS.concat(['german']).map((l) => [l, s.call('getTranslations', l)])));
add('pure/getTourDisplayName', (s) => Object.fromEntries(TOUR_CODES.map((c) => [c, s.call('getTourDisplayName', c)])));
add('pure/getTourDurationHours', (s) => ({
  default1: Object.fromEntries(DURATION_INPUTS.map((c) => [c, s.call('getTourDurationHours', c, 1)])),
  noDefault: s.call('getTourDurationHours', 'unknown-code'),
  default5: s.call('getTourDurationHours', 'unknown-code', 5)
}));
add('pure/buildRetryUrl', (s) => ({
  full: LANGS.map((lang) => s.call('buildRetryUrl', booking({ lang, tour: 'Tour & más' }))),
  minimal: s.call('buildRetryUrl', {})
}));
add('pure/buildStartEnd', (s) => ({
  valid: s.call('buildStartEnd', '2026-10-15', '14:30', 2),
  invalidFallsBackToNow: s.call('buildStartEnd', '', undefined, 1)
}));

// doGet
add('doGet/listAllBookings', (s) => {
  s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5');
  s.seed('boat2', 'GYG: Bob 2p', GYG_CONFIRMED, '7', '2026-11-01', '10:00', '12:00');
  return { ranged: s.get({ action: 'listAllBookings', start: '2026-10-01', end: '2026-10-31' }), wholeYear: s.get({ action: 'listAllBookings' }) };
});
add('doGet/unknown', (s) => s.get({ action: 'nope' }));

// doPost — generic
add('doPost/unknown-action', (s) => s.post({ action: 'nope' }));
add('doPost/no-action', (s) => s.post({}));
add('doPost/malformed-json', (s) => {
  const r = s.post('{not json');
  // The SyntaxError text depends on the JS engine version: keep only its type.
  r.body.error = String(r.body.error).replace(/^(SyntaxError).*$/s, '$1: <engine message>');
  return r;
});

// createBooking
for (const lang of LANGS) add('doPost/createBooking/paid.' + lang, (s) => s.post(booking({ action: 'createBooking', lang })));
add('doPost/createBooking/paid-lowercase-status', (s) => s.post(booking({ action: 'createBooking', payment_status: 'paid' })));
add('doPost/createBooking/pending-no-emails', (s) => s.post(booking({ action: 'createBooking', payment_status: 'PENDING' })));
add('doPost/createBooking/boat2-wine-group', (s) => s.post(booking({ action: 'createBooking', calendar: 'boat2', tour: 'book-wine', groupNumber: 1, tapas: '0' })));
add('doPost/createBooking/tourTitle-only', (s) => s.post(booking({ action: 'createBooking', tour: undefined, tourTitle: 'Copenhagen to Malmö Experience' })));
add('doPost/createBooking/invalid-guest-email', (s) => s.post(booking({ action: 'createBooking', email: 'not-an-email' })));
add('doPost/createBooking/no-email-no-sumup', (s) => s.post({ action: 'createBooking', name: 'Walk-in', date: '2026-10-15', time: '09:00', sumup_checkout_id: 'N/A' }));
add('doPost/createBooking/invalid-date-uses-now', (s) => s.post(booking({ action: 'createBooking', date: 'garbage', time: '' })));
add('doPost/createBooking/duplicate', (s) => { s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5'); return s.post(booking({ action: 'createBooking' })); });
add('doPost/createBooking/lock-timeout', (s) => s.post(booking({ action: 'createBooking' })), { lockTimeout: true });
add('doPost/createBooking/gmail-throws', (s) => s.post(booking({ action: 'createBooking' })), { gmailThrows: true });

// GYG holds (PROD only — DEMO must answer "Action not recognized")
const hold = (over) => Object.assign({ gyg_booking_id: 'GYG-1', tour: 'book-1h-2h', calendar: 'boat1', date: '2026-10-15', time: '14:00', qty: 3 }, over);
add('doPost/createHoldEvent/new', (s) => s.post(hold({ action: 'createHoldEvent' })));
add('doPost/createHoldEvent/amend-existing-hold', (s) => { s.seed('boat1', '⏳ GYG HOLD: 2p', GYG_HOLD, '8'); return s.post(hold({ action: 'createHoldEvent', time: '16:00' })); });
add('doPost/createHoldEvent/already-confirmed', (s) => { s.seed('boat1', 'GYG: Bob 2p', GYG_CONFIRMED, '7'); return s.post(hold({ action: 'createHoldEvent' })); });
add('doPost/createHoldEvent/missing-fields', (s) => s.post({ action: 'createHoldEvent', gyg_booking_id: 'GYG-1' }));
const confirm = (over) => hold(Object.assign({ name: 'Bob Smith', email: 'bob@example.com', phone: '+1 555', lang: 'english', source: 'GetYourGuide' }, over));
add('doPost/confirmHoldEvent/upgrades-hold', (s) => { s.seed('boat1', '⏳ GYG HOLD: 3p', GYG_HOLD, '8'); return s.post(confirm({ action: 'confirmHoldEvent' })); });
add('doPost/confirmHoldEvent/no-prior-hold.spanish', (s) => s.post(confirm({ action: 'confirmHoldEvent', lang: 'spanish', calendar: 'boat2' })));
add('doPost/confirmHoldEvent/gmail-throws', (s) => s.post(confirm({ action: 'confirmHoldEvent' })), { gmailThrows: true });
add('doPost/confirmHoldEvent/missing-id', (s) => s.post({ action: 'confirmHoldEvent' }));
add('doPost/deleteHoldEvent/found', (s) => { s.seed('boat2', '⏳ GYG HOLD: 3p', GYG_HOLD, '8'); return s.post({ action: 'deleteHoldEvent', gyg_booking_id: 'GYG-1' }); });
add('doPost/deleteHoldEvent/not-found', (s) => s.post({ action: 'deleteHoldEvent', gyg_booking_id: 'GYG-404' }));
add('doPost/deleteHoldEvent/missing-id', (s) => s.post({ action: 'deleteHoldEvent' }));

// OTP / resend
add('doPost/sendOtp/ok', (s) => s.post({ action: 'sendOtp', code: '123456' }));
add('doPost/sendOtp/missing-code', (s) => s.post({ action: 'sendOtp' }));
add('doPost/sendOtp/gmail-throws', (s) => s.post({ action: 'sendOtp', code: '123456' }), { gmailThrows: true });
for (const lang of LANGS) add('doPost/resendEmail/ok.' + lang, (s) => s.post(booking({ action: 'resendEmail', lang, tour: 'book-10p-2h' })));
add('doPost/resendEmail/missing-fields', (s) => s.post({ action: 'resendEmail', email: 'ana@example.com' }));
add('doPost/resendEmail/gmail-throws', (s) => s.post(booking({ action: 'resendEmail' })), { gmailThrows: true });

// Templated customer emails
const EMAIL_ACTIONS = {
  paymentFailed: {},
  paymentReminder: {},
  sendCancellationEmail: {},
  sendReviewEmail: { reviewUrl: REVIEW_URL }
};
for (const [action, extra] of Object.entries(EMAIL_ACTIONS)) {
  for (const lang of LANGS) add(`doPost/${action}/ok.${lang}`, (s) => s.post(booking(Object.assign({ action, lang }, extra))));
  add(`doPost/${action}/no-lang-defaults-english`, (s) => s.post(Object.assign({ action, email: 'ana@example.com' }, extra)));
  add(`doPost/${action}/unknown-lang`, (s) => s.post(booking(Object.assign({ action, lang: 'german' }, extra))));
  add(`doPost/${action}/missing-email`, (s) => s.post(Object.assign({ action }, extra)));
  add(`doPost/${action}/invalid-email`, (s) => s.post(Object.assign({ action, email: 'not an email' }, extra)));
  add(`doPost/${action}/gmail-throws`, (s) => s.post(booking(Object.assign({ action }, extra))), { gmailThrows: true });
}
add('doPost/sendReviewEmail/missing-reviewUrl', (s) => s.post(booking({ action: 'sendReviewEmail' })));

// updateEvent / deleteEvent
const updatePayload = (over) => Object.assign({ action: 'updateEvent', sumup_id: 'chk_123', tour: 'book-1h-2h', date: '2026-10-16', time: '10:00', qty: 5, extras: '3', lang: 'danish', amount: '2500', currency: 'DKK', name: 'Ana G.', email: 'ana@example.com', phone: '+45 1' }, over);
add('doPost/updateEvent/sumup-in-place', (s) => { s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5'); return s.post(updatePayload({ boat: 'boat1' })); });
add('doPost/updateEvent/sumup-no-boat-explicit-endTime', (s) => { s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5'); return s.post(updatePayload({ endTime: '13:30', tour: '' })); });
add('doPost/updateEvent/move-to-boat2', (s) => { s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5'); return s.post(updatePayload({ boat: 'boat2' })); });
add('doPost/updateEvent/gyg', (s) => { s.seed('boat2', 'GYG: Bob 2p', GYG_CONFIRMED, '7'); return s.post(updatePayload({ sumup_id: undefined, gyg_booking_id: 'GYG-1', boat: 'boat2' })); });
add('doPost/updateEvent/not-found', (s) => s.post(updatePayload({})));
add('doPost/updateEvent/missing-ids', (s) => s.post({ action: 'updateEvent', date: '2026-10-16' }));
add('doPost/deleteEvent/sumup-found', (s) => { s.seed('boat1', 'Reserva: Ana', SUMUP_DESC, '5'); return s.post({ action: 'deleteEvent', sumup_id: 'chk_123' }); });
add('doPost/deleteEvent/gyg-found', (s) => { s.seed('boat2', 'GYG: Bob 2p', GYG_CONFIRMED, '7'); return s.post({ action: 'deleteEvent', gyg_booking_id: 'GYG-1' }); });
add('doPost/deleteEvent/not-found', (s) => s.post({ action: 'deleteEvent', sumup_id: 'chk_404' }));
add('doPost/deleteEvent/missing-ids', (s) => s.post({ action: 'deleteEvent' }));

// Manual blocks
const block = (over) => Object.assign({ action: 'createBlockEvent', calendar: 'boat2', date: '2026-10-20', startTime: '09:00', endTime: '12:30', reason: 'Mantenimiento', group_id: 'grp-1' }, over);
add('doPost/createBlockEvent/ok', (s) => s.post(block({})));
add('doPost/createBlockEvent/no-reason-default-boat', (s) => s.post(block({ reason: '', calendar: undefined })));
add('doPost/createBlockEvent/end-before-start', (s) => s.post(block({ endTime: '08:00' })));
add('doPost/createBlockEvent/missing-fields', (s) => s.post({ action: 'createBlockEvent', date: '2026-10-20' }));
add('doPost/deleteBlockEvent/deletes-group', (s) => {
  s.seed('boat1', '⛔ BLOQUEADO', 'BLOCK_GROUP: grp-1\nSource: Admin Panel', '8', '2026-10-20', '09:00', '12:00');
  s.seed('boat2', '⛔ BLOQUEADO', 'BLOCK_GROUP: grp-1\nSource: Admin Panel', '8', '2026-10-21', '09:00', '12:00');
  s.seed('boat2', '⛔ BLOQUEADO', 'BLOCK_GROUP: grp-2\nSource: Admin Panel', '8', '2026-10-22', '09:00', '12:00');
  return s.post({ action: 'deleteBlockEvent', group_id: 'grp-1' });
});
add('doPost/deleteBlockEvent/missing-group', (s) => s.post({ action: 'deleteBlockEvent' }));

// Triggers (names are bound to installed Apps Script triggers — must keep existing)
for (const fn of ['setupGygExpireHoldsTrigger', 'setupPaymentReminderTrigger', 'setupPostTourEmailTrigger']) {
  add('triggers/' + fn, (s) => s.call(fn));
}
for (const fn of ['checkGygExpireHolds', 'checkPendingPaymentReminders', 'checkPostTourEmails']) {
  add(`triggers/${fn}/ok`, (s) => s.call(fn));
  add(`triggers/${fn}/missing-site-url`, (s) => s.call(fn), { props: { CRON_SECRET: 'secret-123' } });
  add(`triggers/${fn}/missing-cron-secret`, (s) => s.call(fn), { props: { SITE_URL: 'https://site.harness.test' } });
  add(`triggers/${fn}/fetch-throws`, (s) => s.call(fn), { fetchThrows: true });
}

// Manual editor tests
add('tests/testCalendar', (s) => s.call('testCalendar'));
add('tests/testEmail', (s) => {
  s.call('testEmail');
  // The recipient is a per-environment personal address: not part of the contract.
  s.rec.gmail.forEach((m) => { if (m.to !== 'admin@harness.test') m.to = '<TEST_EMAIL>'; });
  s.rec.logs = s.rec.logs.map((l) => l.replace(/^(Guest email sent to: ).*$/, '$1<TEST_EMAIL>'));
});

/* ───────────────────────── Runner ───────────────────────── */

function buildSnapshot(file) {
  const files = renderTemplates(file);
  const cases = {};

  for (const c of CASES) {
    const s = createSandbox(file, Object.assign(defaultCfg(), c.cfg));
    const out = {};
    try {
      const result = c.run(s);
      if (result !== undefined) out.result = result;
    } catch (e) {
      out.threw = String(e);
    }
    const r = s.rec;
    if (r.logs.length) out.logs = r.logs;
    if (r.locks.length) out.locks = r.locks;
    if (r.gmail.length) {
      out.gmail = r.gmail.map((m) => {
        const options = Object.assign({}, m.options);
        if (options.htmlBody !== undefined) {
          const html = String(options.htmlBody);
          const ref = 'bodies/' + crypto.createHash('sha256').update(html).digest('hex').slice(0, 16) + '.html';
          files[ref] = html;
          options.htmlBody = '@' + ref;
        }
        return { to: m.to, subject: m.subject, body: m.body, options };
      });
    }
    if (r.events.length) out.events = r.events;
    if (r.fetches.length) out.fetches = r.fetches;
    if (r.triggers.length) out.triggers = r.triggers;
    cases[c.name] = out;
  }

  files['cases.json'] = JSON.stringify(cases, null, 2) + '\n';
  return files;
}

function firstDiff(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  let i = 0;
  while (i < ba.length && i < bb.length && ba[i] === bb[i]) i++;
  const ctx = (buf) => JSON.stringify(buf.subarray(Math.max(0, i - 40), i + 60).toString('utf8'));
  return `byte ${i} (expected ${ba.length} bytes, got ${bb.length})\n      expected: …${ctx(ba)}\n      actual:   …${ctx(bb)}`;
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

function compare(envName, files) {
  const dir = path.join(SNAP_DIR, envName);
  const problems = [];
  const onDisk = new Set(listFiles(dir));

  for (const [rel, content] of Object.entries(files)) {
    if (!onDisk.has(rel)) {
      // Email bodies are content-addressed: a missing one is reported through cases.json.
      if (!rel.startsWith('bodies/')) problems.push(`MISSING snapshot: ${rel}`);
      continue;
    }
    onDisk.delete(rel);
    const expected = fs.readFileSync(path.join(dir, rel), 'utf8');
    if (expected === content) continue;
    if (rel === 'cases.json') {
      const exp = JSON.parse(expected), act = JSON.parse(content);
      for (const name of new Set(Object.keys(exp).concat(Object.keys(act)))) {
        const e = JSON.stringify(exp[name], null, 2), a = JSON.stringify(act[name], null, 2);
        if (e === a) continue;
        if (e === undefined) problems.push(`NEW case (not in snapshot): ${name}`);
        else if (a === undefined) problems.push(`REMOVED case: ${name}`);
        else problems.push(`DIFF case ${name}: ${firstDiff(e, a)}${bodyDiffs(dir, files, exp[name], act[name])}`);
      }
    } else {
      problems.push(`DIFF ${rel}: ${firstDiff(expected, content)}`);
    }
  }
  for (const rel of onDisk) if (!rel.startsWith('bodies/')) problems.push(`STALE snapshot (no longer produced): ${rel}`);
  return problems;
}

// When an email body hash changed, show where the HTML itself diverges.
function bodyDiffs(dir, files, exp, act) {
  let out = '';
  const eg = (exp && exp.gmail) || [], ag = (act && act.gmail) || [];
  for (let i = 0; i < Math.min(eg.length, ag.length); i++) {
    const er = eg[i].options.htmlBody, ar = ag[i].options.htmlBody;
    if (!er || !ar || er === ar) continue;
    const ePath = path.join(dir, er.slice(1));
    if (fs.existsSync(ePath)) out += `\n    email #${i} htmlBody: ${firstDiff(fs.readFileSync(ePath, 'utf8'), files[ar.slice(1)])}`;
  }
  return out;
}

const update = process.argv.includes('--update');
let failed = false;

for (const [envName, file] of Object.entries(ENVS)) {
  const files = buildSnapshot(file);
  const count = Object.keys(files).length;
  if (update) {
    const dir = path.join(SNAP_DIR, envName);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    console.log(`${envName}: snapshot written (${count} files, ${CASES.length} cases)`);
    continue;
  }
  const problems = compare(envName, files);
  if (problems.length) {
    failed = true;
    console.log(`${envName}: ${problems.length} difference(s)`);
    problems.forEach((p) => console.log('  - ' + p));
  } else {
    console.log(`${envName}: OK (${count} files, ${CASES.length} cases identical)`);
  }
}

process.exit(failed ? 1 : 0);
