import SupaModel from './SupaModel';

// NotificationPreference: per-user notification settings. One row per user
// (user_id is PK). Holds the global enable flag, timezone (IANA), quiet
// hours window, and a `prefs` jsonb where consuming apps store their own
// per-prompt-type opt-ins (e.g. `{ morningPrompts: true, eveningPrompts: false }`).
//
// `is_quiet_hour(user_id)` SQL helper (defined alongside this table) reads
// the same row from cron jobs to filter recipients.
//
// Skip caching — preference changes are infrequent but must be read fresh
// before each push (small table, low cost).

export default class NotificationPreference extends SupaModel {

  user_id = null;
  enabled = false;
  timezone = null;
  quiet_start = null;
  quiet_end = null;
  prefs = {};
  created_at = null;
  updated_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async loadForUser(userId) {
    return this.findModel(NotificationPreference, 'notification_preferences', { user_id: userId });
  }

  // Idempotent: same user_id updates rather than duplicates.
  static async upsert(userId, fields = {}) {
    return this.upsertModel(
      'notification_preferences',
      { user_id: userId, ...fields, updated_at: new Date().toISOString() },
      'user_id',
      true,
    );
  }

  async save() {
    return this.saveModel(
      NotificationPreference,
      'notification_preferences',
      ['user_id', 'enabled', 'timezone', 'quiet_start', 'quiet_end', 'prefs', 'updated_at'],
      ['user_id'],
    );
  }
}
