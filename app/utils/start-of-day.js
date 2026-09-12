// Midnight at the start of the LOCAL day containing `date`. Used as the "since"
// bound for per-day counts (lessons finished today, practices done today).
// Defaults to today.
//
// Local, not UTC, and deliberately so: "today" for a user is their calendar
// day, and a UTC boundary makes an evening in North America belong to tomorrow.
// `toISOString()` on the result converts that local midnight to the instant the
// server stores, which is exactly what a `completed_at >= …` filter wants.

export default function (date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
