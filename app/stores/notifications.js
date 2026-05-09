import Notification from '../models/Notification';
import Notifications from '../models/Notifications';

// Layer-level notifications-settings store. One settings row per user
// (PK = user_id), so the standard `loadItem({id})` doesn't apply — use
// `loadForUser(userId)` and `upsertForUser(userId, fields)` instead.
//
// Despite the table name, this store manages **settings** (opt-in flag,
// timezone, quiet hours, app prefs jsonb), not sent-notification records.

export const useNotificationsStore = createSupaStore(
  'notifications',
  Notification,
  Notifications,
  () => ({

    async loadForUser(userId) {
      return Notification.loadForUser(userId);
    },

    async upsertForUser(userId, fields = {}) {
      return Notification.upsert(userId, fields);
    },
  }),
);
