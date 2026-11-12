// utils/dates.js
// Trip dates are plain 'YYYY-MM-DD' strings (no time, no time zone), so a date never shifts by a day
// between the phone, the server and MongoDB. All arithmetic is done in UTC.
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

function toUTC(s) {
  const m = ISO.exec(String(s));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // rejects 2026-02-30 and similar (Date.UTC would roll it over to March)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

const isValidISODate = (s) => toUTC(s) !== null;

function fromUTC(t) {
  const d = new Date(t);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function addDays(s, n) {
  const t = toUTC(s);
  if (t === null) throw new Error(`Invalid date: ${s}`);
  return fromUTC(t + n * DAY_MS);
}

// Number of days from start to end, both included (2026-11-12 to 2026-11-14 = 3).
function daysInclusive(start, end) {
  const a = toUTC(start);
  const b = toUTC(end);
  if (a === null || b === null) throw new Error('Invalid date');
  return Math.round((b - a) / DAY_MS) + 1;
}

const todayISO = (now = new Date()) => fromUTC(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

// Returns the number of days, or throws an Error whose message says what is wrong.
// The start may be one day in the past: the server's UTC date can lag behind the user's local date.
function validateTripDates(startDate, endDate, { maxDays = 14, now = new Date() } = {}) {
  if (!isValidISODate(startDate)) throw new Error('startDate must look like YYYY-MM-DD');
  if (!isValidISODate(endDate)) throw new Error('endDate must look like YYYY-MM-DD');
  if (startDate < addDays(todayISO(now), -1)) throw new Error('startDate cannot be in the past');
  const days = daysInclusive(startDate, endDate);
  if (days < 1) throw new Error('endDate cannot be before startDate');
  if (days > maxDays) throw new Error(`The trip can be at most ${maxDays} days long (you chose ${days} days)`);
  return days;
}

module.exports = { isValidISODate, addDays, daysInclusive, todayISO, validateTripDates };
