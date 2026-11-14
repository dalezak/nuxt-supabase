// "What day is it for this user" — LOCAL midnight, never UTC. A UTC boundary
// flips the day mid-afternoon for users far from Greenwich and puts an evening
// in North America on tomorrow. One place for every day-keyed comparison and
// every deterministic-per-day rotation seed.
//
// Every helper accepts what a caller is likely to hold:
//   'YYYY-MM-DD'  — a Postgres `date` column (reflections.reflected_on): a LOCAL
//                   calendar date. `new Date('2026-07-24')` would read it as UTC
//                   midnight and land on the 23rd west of Greenwich.
//   timestamp     — a `timestamp without time zone` column, serialized with no
//                   zone: UTC (parseTimestamp appends the Z).
//   Date          — passed through.
import parseTimestamp from './parse-timestamp';

function toDate(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  }
  return parseTimestamp(value) ?? new Date(value);
}

// The LOCAL calendar date as 'YYYY-MM-DD' — the day key for day-keyed rows,
// Postgres `date` columns and per-day storage keys. (toISOString would be UTC.)
export default function localDay(date = new Date()) {
  const d = toDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Whole days since the epoch, counted on the LOCAL midnight boundary: the
// deterministic-per-day ROTATION seed (`pickForDay(tags, localDayIndex())`, a
// greeting, an affirmation), so the day's content flips at local midnight.
export function localDayIndex(date = new Date()) {
  const d = toDate(date);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// The local calendar day of a DB timestamp, so "did this happen on my day?"
// reflects the user's clock, not UTC's.
export function localDayOfUtc(ts) {
  return ts ? localDay(parseTimestamp(ts)) : null;
}

// True when the two fall on the same local calendar day.
export function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}
