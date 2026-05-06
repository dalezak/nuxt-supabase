import Kudo from '../models/Kudo';
import Kudos from '../models/Kudos';

// Layer-level kudos store. The `kudos` table lives in this layer, polymorphic
// via (activity_type, activity_id) so each app picks its own activity types.
//
// Apps consume directly via the auto-imported `useKudosStore()`.

export const useKudosStore = createSupaStore('kudos', Kudo, Kudos, () => ({

  async give(fromUserId, toUserId, activityType, activityId) {
    return Kudo.give(fromUserId, toUserId, activityType, activityId);
  },

  async remove(fromUserId, toUserId, activityType, activityId) {
    return Kudo.remove(fromUserId, toUserId, activityType, activityId);
  },

  // Batch-load kudos across many activity rows. Pass items shaped like
  // `{ activity_type, activity_id }` (or `{ type, activity_id }` — both work).
  async loadForActivities(activityItems) {
    return Kudo.loadForActivities(activityItems);
  },
}));
