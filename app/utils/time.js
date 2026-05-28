// Time conversion constants — milliseconds for each granularity. Use
// these everywhere instead of inline `24 * 60 * 60 * 1000` chains so
// "what's a day?" has one answer and the intent of computations like
// `Date.now() - 7 * DAY_MS` reads top-to-bottom without arithmetic.
//
// Auto-imported by Nuxt — reference these constants directly from any
// app/layer that extends this one; no explicit import needed.
//
// Example:
//   const cutoff = new Date(Date.now() - 30 * DAY_MS);
//   const recentlyActive = (Date.now() - last.getTime()) < WEEK_MS;

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
