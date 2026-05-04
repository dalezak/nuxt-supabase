// Format a date as a short relative string ("just now", "5m ago", "2h ago",
// "3d ago"). For activity feeds, recent-event displays, etc. Uses local-clock
// math (not timezone-aware), which is fine for human "how long ago" framing.
//
// Returns '' for falsy input — safe to use directly in templates.

export default function (dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins <= 0) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
