import SupaModel from './SupaModel';
import SupaModels from './SupaModels';

// Like: polymorphic "user appreciates X" via (item_type, item_id).
// Apps pick their own item types — 'reflection', 'lesson', 'post', etc.
// `content` (JSONB, optional) carries data when the like itself is rich
// — e.g. highlighted text from within a longer item.
//
// Layer doesn't enforce like-once semantics; apps that want it add their
// own UNIQUE(user_id, item_type, item_id) in a follow-up migration.

export default class Like extends SupaModel {

  id = null;
  user_id = null;
  item_type = null;
  item_id = null;
  content = null;
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  async store() {
    return this.storeModel(`likes/${this.item_type}/${this.id}`);
  }

  static async restore(item_type, id) {
    return this.restoreModel(Like, `likes/${item_type}/${id}`);
  }

  static async load(id) {
    return this.loadModel(Like, 'likes', { id });
  }

  // Convenience insert. `content` can be a string (wrapped as { text }) or
  // any JSON-serializable object.
  static async insert(userId, itemType, itemId, content = null) {
    return this.insertModel('likes', {
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      content: typeof content === 'string' ? { text: content } : content,
    });
  }

  static async remove(userId, itemType, itemId) {
    return SupaModels.deleteModels('likes', [
      ['user_id', 'eq', userId],
      ['item_type', 'eq', itemType],
      ['item_id', 'eq', itemId],
    ]);
  }

  // Delete a like distinguished by content (used by apps that allow multiple
  // likes per item — e.g. multiple highlights of the same lesson).
  static async removeByContent(userId, itemType, itemId, contentText) {
    return SupaModels.deleteModels('likes', [
      ['user_id', 'eq', userId],
      ['item_type', 'eq', itemType],
      ['item_id', 'eq', itemId],
      ['content', 'contains', { text: contentText }],
    ]);
  }

  async save() {
    return this.saveModel(Like, 'likes', ['id', 'user_id', 'item_type', 'item_id', 'content'], ['id']);
  }
}
