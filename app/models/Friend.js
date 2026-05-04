import SupaModel from './SupaModel';
import SupaModels from './SupaModels';
import User from './User';
import Friends from './Friends';

// Friend: a row in the friends table. Bidirectional; the row stores
// (user_id = sender, friend_id = recipient, status). Apps shouldn't need
// to think about direction in most cases — `loadForUser` handles both.
//
// Renamed from any-learn-co's Friendship.

export default class Friend extends SupaModel {

  id = null;
  user_id = null;
  friend_id = null;
  status = 'pending';
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  async save() {
    return this.saveModel(Friend, 'friends', ['id', 'user_id', 'friend_id', 'status'], ['id']);
  }

  async delete() {
    return this.deleteModel(Friend, 'friends', { id: this.id });
  }

  // Send a friend request to the user with `toEmail`, from `fromUserId`.
  // Returns the found User on success, null if email isn't found, or null
  // if attempting to friend yourself.
  static async sendRequest(fromUserId, toEmail) {
    const toUser = await this.findModel(User, 'users', { email: toEmail.trim().toLowerCase() });
    if (!toUser || toUser.id === fromUserId) return null;
    await this.insertModel('friends', { user_id: fromUserId, friend_id: toUser.id });
    return toUser;
  }

  // Accept a pending friend request by id.
  static async accept(friendId) {
    const friend = await this.loadModel(Friend, 'friends', { id: friendId });
    if (!friend) return;
    friend.status = 'accepted';
    await friend.save();
  }

  // Remove a friendship (or cancel a pending request) by id.
  static async remove(friendId) {
    const friend = new Friend({ id: friendId });
    await friend.delete();
  }

  // Find the friend row between two users (any direction), or null.
  static async between(userId, otherId) {
    return this.findModel(Friend, 'friends', {}, {
      or: `and(user_id.eq.${userId},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${userId})`,
    });
  }

  // Returns { friends, pending, requests } for the given user.
  // friends: status = 'accepted' (either direction)
  // pending: status = 'pending', the user sent it
  // requests: status = 'pending', the user received it
  static async loadForUser(userId) {
    const rows = await SupaModels.loadModels(Friends, Friend, 'friends', {
      select: '*, sender:users!friends_user_id_fkey(id, name, email), recipient:users!friends_friend_id_fkey(id, name, email)',
      or: `user_id.eq.${userId},friend_id.eq.${userId}`,
      order: 'created_at:desc',
      limit: 1000,
    });
    const friends = [], pending = [], requests = [];
    for (const row of rows) {
      const iSent = row.user_id === userId;
      const other = iSent ? row.recipient : row.sender;
      const entry = { id: row.id, status: row.status, user: other };
      if (row.status === 'accepted') friends.push(entry);
      else if (iSent) pending.push(entry);
      else requests.push(entry);
    }
    return { friends, pending, requests };
  }

  // Returns just the accepted friend user_ids for the given user.
  // Useful for "load activity for all friends" queries.
  static async loadFriendIds(userId) {
    const rows = await SupaModels.loadModels(Friends, Friend, 'friends', {
      select: 'user_id, friend_id',
      where: [['status', 'eq', 'accepted']],
      or: `user_id.eq.${userId},friend_id.eq.${userId}`,
      limit: 10000,
    });
    return rows.map(r => r.user_id === userId ? r.friend_id : r.user_id);
  }
}
