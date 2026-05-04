import Streak from '../models/Streak';

// useStreak — generic streak management. Each consuming app calls
// `updateStreak(userId)` at its own activity moments (lesson completion,
// reflection saved, daily check-in). The layer maintains the math:
//
//   - Same calendar day: no-op (returns current row, gap=0)
//   - 1 day gap (yesterday): increment current_streak, reset grace
//   - 2 day gap (one day skipped) AND grace not used:
//                            increment current_streak, mark grace_used
//   - 2+ day gap with grace used, OR 3+ day gap: reset current_streak to 1
//
// Lifetime_days increments by 1 every time a NEW calendar day logs activity.
// Never resets — gives apps a "days of practice" metric independent of streak.
//
// Returns:
//   { streak, gap, wasReset, isNew }
//     streak    — the (saved) Streak instance
//     gap       — days between previous last_activity_at and now (0 if same day, null if isNew)
//     wasReset  — true if the streak was reset to 1 due to a gap
//     isNew     — true if this is the user's first activity ever

export function useStreak() {

  async function updateStreak(userId) {
    if (!userId) return null;

    const now = new Date();
    const today = startOfDay(now);

    const existing = await Streak.loadForUser(userId);

    if (!existing) {
      const fresh = await new Streak({
        user_id: userId,
        current_streak: 1,
        longest_streak: 1,
        lifetime_days: 1,
        last_activity_at: now.toISOString(),
        grace_used: false,
      }).save();
      return { streak: fresh, gap: null, wasReset: false, isNew: true };
    }

    const lastDay = startOfDay(new Date(existing.last_activity_at));
    const gap = Math.round((today.getTime() - lastDay.getTime()) / 86400000);

    // Already logged activity today — no change
    if (gap === 0) {
      return { streak: existing, gap: 0, wasReset: false, isNew: false };
    }

    let newStreak;
    let graceUsed = existing.grace_used;
    let wasReset = false;

    if (gap === 1) {
      // Consecutive day — continue streak, reset grace
      newStreak = existing.current_streak + 1;
      graceUsed = false;
    } else if (gap === 2 && !existing.grace_used) {
      // One-day gap with grace available — continue streak, spend grace
      newStreak = existing.current_streak + 1;
      graceUsed = true;
    } else {
      // Larger gap (or grace already used) — reset
      newStreak = 1;
      graceUsed = false;
      wasReset = true;
    }

    existing.current_streak = newStreak;
    existing.longest_streak = Math.max(newStreak, existing.longest_streak);
    existing.lifetime_days = (existing.lifetime_days ?? 0) + 1;
    existing.last_activity_at = now.toISOString();
    existing.grace_used = graceUsed;
    existing.updated_at = now.toISOString();

    const saved = await existing.save();
    return { streak: saved, gap, wasReset, isNew: false };
  }

  async function loadStreak(userId) {
    if (!userId) return null;
    return Streak.loadForUser(userId);
  }

  return { updateStreak, loadStreak };
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
