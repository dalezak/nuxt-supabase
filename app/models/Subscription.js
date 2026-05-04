import SupaModel from './SupaModel';
import SupaModels from './SupaModels';

// Subscription: a single web-push endpoint registered by a user
// (PushManager.subscribe() result). Owner-only RLS.
//
// Skip caching — push endpoints are auth-state, not curated content.

export default class Subscription extends SupaModel {

  id = null;
  user_id = null;
  endpoint = null;
  p256dh = null;
  auth = null;
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async load(id) {
    return this.loadModel(Subscription, 'subscriptions', { id });
  }

  // Idempotent: same (user_id, endpoint) pair updates rather than duplicates.
  static async upsert(userId, endpoint, p256dh, auth) {
    return this.upsertModel('subscriptions', {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
    }, 'user_id,endpoint');
  }

  static async deleteForUser(userId, endpoint) {
    return SupaModels.deleteModels('subscriptions', [
      ['user_id', 'eq', userId],
      ['endpoint', 'eq', endpoint],
    ]);
  }

  async save() {
    return this.saveModel(Subscription, 'subscriptions', ['id', 'user_id', 'endpoint', 'p256dh', 'auth'], ['id']);
  }
}
