import Badge from '../models/Badge';
import Badges from '../models/Badges';

// Layer-level badges store. The `badges` and `awards` tables live in this
// layer (see corresponding migrations), so the store does too. Apps consume
// it directly via the auto-imported `useBadgesStore()`.

export const useBadgesStore = createSupaStore('badges', Badge, Badges, () => ({

  // Badges earned by `userId`, hydrated with badge metadata + earned_at.
  // RLS on `awards` permits reading own awards and accepted-friends' awards.
  async loadForUser(userId) {
    return Badges.loadForUser(userId);
  },
}));
