// Midnight at the start of the ISO week containing `date` (Monday). Used as
// the "since" bound for weekly counts (e.g. weekly study goal, weekly active
// users). Defaults to today.

export default function (date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // getDay(): 0 = Sunday, 1 = Monday … 6 = Saturday. Roll back to Monday.
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  return d;
}
