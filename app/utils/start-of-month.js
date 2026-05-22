// Midnight on the first day of the calendar month containing `date`. Used as
// the "since" bound for monthly counts (e.g. per-tier course-creation caps).
// Defaults to today.

export default function (date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
