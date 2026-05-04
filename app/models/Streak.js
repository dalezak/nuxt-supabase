import SupaModel from './SupaModel';

// Streak: per-user activity tracking. One row per user. The `useStreak()`
// composable in this layer handles the update math (consecutive days, grace,
// resets, lifetime increment); models like this just provide CRUD.
//
// Skip caching — streak state changes on every activity and the user expects
// to see their newest streak immediately.

export default class Streak extends SupaModel {

  id = null;
  user_id = null;
  current_streak = 0;
  longest_streak = 0;
  lifetime_days = 0;
  last_activity_at = null;
  grace_used = false;
  created_at = null;
  updated_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async load(id) {
    return this.loadModel(Streak, 'streaks', { id });
  }

  static async loadForUser(userId) {
    return this.findModel(Streak, 'streaks', { user_id: userId });
  }

  async save() {
    return this.saveModel(
      Streak,
      'streaks',
      ['id', 'user_id', 'current_streak', 'longest_streak', 'lifetime_days', 'last_activity_at', 'grace_used', 'updated_at'],
      ['id'],
    );
  }
}
