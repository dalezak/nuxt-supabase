import localDay from './local-day';

// Midnight at the start of the LOCAL day containing `date`. Used as the "since"
// bound for per-day counts (lessons finished today, practices done today) and as
// a day bucket's key. Defaults to today; never mutates the argument.
//
// Local, not UTC, and deliberately so: "today" for a user is their calendar
// day, and a UTC boundary makes an evening in North America belong to tomorrow.
// `toISOString()` on the result converts that local midnight to the instant the
// server stores, which is exactly what a `completed_at >= …` filter wants.
//
// Accepts what localDay does: a Date, a DB timestamp (a zone-less one is UTC,
// which `new Date()` would read as local and shift by the viewer's offset), or
// a 'YYYY-MM-DD' `date` column (a LOCAL date, not UTC midnight).

export default function (date = new Date()) {
  const [y, m, d] = localDay(date).split('-').map(Number);
  return new Date(y, m - 1, d);
}
