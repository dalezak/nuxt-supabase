import SupaModel from './SupaModel';
import Award from './Award';

// Badge: definition of an achievement. Identified by `type` (a stable slug
// for the kind of badge — 'first_step', 'week_warrior', etc.). Display
// fields: name, description, icon. Per-app seed data populates this table.
//
// Badges aren't cached locally (stored as ref data via the standard load
// path; small set per app, fetched once when needed).

export default class Badge extends SupaModel {

  id = null;
  type = null;
  name = null;
  description = null;
  icon = null;
  earned_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async load(id) {
    return this.loadModel(Badge, 'badges', { id });
  }

  // Award this badge to the given user. Idempotent: if already awarded,
  // does nothing. Returns { name, description } only when the badge was
  // *just* earned (within the last 5 seconds) — for one-time toast / celebration.
  // Returns null if the badge wasn't earned right now (already-earned or
  // unknown type), so callers can branch cleanly.
  static async award(userId, type) {
    if (!userId || !type) return null;
    const badge = await this.findModel(Badge, 'badges', { type });
    if (!badge) return null;
    try {
      await this.upsertModel('awards', { user_id: userId, badge_id: badge.id }, 'user_id,badge_id', true);
    } catch (error) {
      consoleError('Badge.award', type, error);
      return null;
    }
    const award = await this.findModel(Award, 'awards', { user_id: userId, badge_id: badge.id });
    const justEarned = !!award && (Date.now() - new Date(award.earned_at).getTime()) < 5000;
    return justEarned ? { name: badge.name, description: badge.description, icon: badge.icon } : null;
  }
}
