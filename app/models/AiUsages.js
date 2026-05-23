import SupaModels from './SupaModels';
import AiUsage from './AiUsage';

// AI usage collection. Only count-shaped reads from the client; individual
// rows aren't surfaced anywhere. If a future surface needs per-call
// inspection (admin dashboard, debugging UI), add a `loadForUser` method
// here following the standard pagination convention.

export default class AiUsages extends SupaModels {

  constructor(models = []) {
    super(AiUsage, models);
  }

  // Count of a user's AI usage rows within an optional date window. Pass
  // `since` as a Date or ISO string to bound to a window (e.g. start of
  // this month); omit for all-time. Returns the integer directly — no
  // rows over the wire — via `SupaModels.countModels`.
  static async countForUser(userId, { since = null, functionName = null } = {}) {
    const where = [['user_id', 'eq', userId]];
    if (functionName) where.push(['function_name', 'eq', functionName]);
    if (since) {
      const iso = since instanceof Date ? since.toISOString() : since;
      where.push(['created_at', 'gte', iso]);
    }
    return this.countModels('ai_usage', where);
  }
}
