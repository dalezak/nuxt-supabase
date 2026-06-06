// Parse a database timestamp into a correct Date.
//
// This stack stores timestamps as UTC in `timestamp without time zone`
// columns (the default `now()`, on a UTC server). PostgREST serializes those
// with NO timezone offset, e.g. "2026-06-06T13:51:39.095811". `new Date()`
// parses an offset-less date-time string as LOCAL time, which shifts it by the
// viewer's UTC offset — the classic "the time is off by N hours" bug.
//
// parseTimestamp normalizes that: an offset-less value is interpreted as UTC
// (append "Z"); a value that already carries a zone (Z or ±hh:mm) or is a Date
// is passed through untouched. Use this everywhere a DB timestamp becomes a
// Date for display or day math, instead of `new Date(row.created_at)`.
//
// Returns a Date, or null for empty input.

export default function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const s = String(value).trim();
  // Postgres may use a space separator; ISO needs the "T".
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  // Already zoned (trailing Z or ±hh:mm / ±hhmm) → trust it; else it's UTC.
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}
