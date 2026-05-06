import NotificationPreference from '../models/NotificationPreference';
import NotificationPreferences from '../models/NotificationPreferences';

// Layer-level notification-preferences store. One preference row per user
// (PK = user_id), so the standard `loadItem({id})` doesn't apply — use
// `loadForUser(userId)` and `upsertForUser(userId, fields)` instead.

export const useNotificationPreferencesStore = createSupaStore(
  'notification_preferences',
  NotificationPreference,
  NotificationPreferences,
  () => ({

    async loadForUser(userId) {
      return NotificationPreference.loadForUser(userId);
    },

    async upsertForUser(userId, fields = {}) {
      return NotificationPreference.upsert(userId, fields);
    },
  }),
);
