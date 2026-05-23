import AiUsage from '../models/AiUsage';
import AiUsages from '../models/AiUsages';

// AI usage store — counts of Edge Function calls that consume per-plan
// budget. Pages use this for the "X of N this month" usage card.

export const useAiUsageStore = createSupaStore('ai-usage', AiUsage, AiUsages, () => ({

  // Server-side count — no rows fetched. Pass `since` (Date | ISO string)
  // to bound to a window; defaults to all-time.
  async countForUser(userId, options = {}) {
    return AiUsages.countForUser(userId, options);
  },
}));
