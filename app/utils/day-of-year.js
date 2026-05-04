// Returns 1..366 for the given date (default today). Used to seed deterministic
// daily picks (today's principle, today's habit, today's suggestion) so the
// surface is stable within a day but rotates across days.

export default function (date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
