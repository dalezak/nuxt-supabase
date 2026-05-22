// Returns today's day-of-year (1-366) in UTC. Used by Edge Functions to
// rotate notification copy variants deterministically — every user sees
// the same variant on the same day, but the variant changes day-to-day.
//
// `(dayOfYear() % VARIANTS.length)` picks the index. Falls into a stable
// cycle that wraps cleanly on Dec 31 / Jan 1.

export function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
