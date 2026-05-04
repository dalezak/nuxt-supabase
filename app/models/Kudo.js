import SupaModel from './SupaModel';
import SupaModels from './SupaModels';

// Kudo: a small acknowledgment one user gives another for a specific activity.
// Polymorphic via (activity_type, activity_id) — consuming apps pick the
// types ('reflection', 'lesson', 'post', etc.) that fit their domain.
//
// `give` is idempotent (UNIQUE constraint on the four key columns).
// `remove` deletes the matching row(s).
// `loadForActivities` batch-loads kudos across many activities — used to
// build counts and "did the current user already give kudos?" maps.

export default class Kudo extends SupaModel {

  id = null;
  from_user_id = null;
  to_user_id = null;
  activity_type = null;
  activity_id = null;
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async give(fromUserId, toUserId, activityType, activityId) {
    return this.upsertModel(
      'kudos',
      { from_user_id: fromUserId, to_user_id: toUserId, activity_type: activityType, activity_id: activityId },
      'from_user_id,to_user_id,activity_type,activity_id',
      true,
    );
  }

  static async remove(fromUserId, toUserId, activityType, activityId) {
    return SupaModels.deleteModels('kudos', [
      ['from_user_id', 'eq', fromUserId],
      ['to_user_id', 'eq', toUserId],
      ['activity_type', 'eq', activityType],
      ['activity_id', 'eq', activityId],
    ]);
  }

  // Batch-load kudos across a set of (type, id) activity references.
  // Useful for activity feeds where each item needs its kudos count.
  static async loadForActivities(activityItems) {
    const items = (activityItems ?? []).filter(a => a.activity_id);
    if (!items.length) return [];
    const client = useSupabaseClient();
    const filters = items
      .map(a => `and(activity_type.eq.${a.type ?? a.activity_type},activity_id.eq.${a.activity_id})`)
      .join(',');
    const { data } = await client
      .from('kudos')
      .select('from_user_id, to_user_id, activity_type, activity_id')
      .or(filters);
    return data ?? [];
  }
}
