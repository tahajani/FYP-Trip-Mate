// Trip dates are 'YYYY-MM-DD' strings (no time zone), the same format the backend stores.
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function toUTC(s: string): number | null {
  const m = ISO.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export const isValidISODate = (s: string) => toUTC(s) !== null;

/** The user's own calendar date today (not UTC). */
export function todayLocalISO(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(s: string, n: number): string {
  const t = toUTC(s);
  if (t === null) return s;
  const d = new Date(t + n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Days from start to end with both included (12 Nov to 14 Nov = 3). Negative if end is before start. */
export function daysInclusive(start: string, end: string): number {
  const a = toUTC(start);
  const b = toUTC(end);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** 'Wed 12 Nov' */
export function formatDay(s?: string): string {
  if (!s) return '';
  const t = toUTC(s);
  if (t === null) return s;
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** '12 Nov' */
export function formatShort(s?: string): string {
  if (!s) return '';
  const t = toUTC(s);
  if (t === null) return s;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
