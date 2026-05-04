import SupaModels from './SupaModels';
import Like from './Like';

export default class Likes extends SupaModels {

  constructor(models = []) {
    super(Like, models);
  }

  // Likes a user has made of a given item type, most recent first.
  static async loadForUserByType(userId, itemType, limit = 50, offset = 0) {
    return this.loadModels(Likes, Like, 'likes', {
      where: [['user_id', 'eq', userId], ['item_type', 'eq', itemType]],
      order: 'created_at:desc',
      limit,
      offset,
    });
  }
}
