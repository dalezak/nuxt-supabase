import SupaModel from './SupaModel';

// Award: a user's instance of earning a specific badge. Created via
// `Badge.award(userId, type)` (idempotent upsert). Owner-only RLS.
//
// Skip caching — awards are user-state, not curated content, and the
// "just earned" celebration depends on freshness.

export default class Award extends SupaModel {

  id = null;
  user_id = null;
  badge_id = null;
  earned_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }
}
