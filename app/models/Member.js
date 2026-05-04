import SupaModel from './SupaModel';
import User from './User';

// Member: a user belonging to a group, with a role ('owner' | 'member' | …).
// Renamed from any-learn-co's Membership — same semantics, shorter name.
//
// `invite(groupId, userId)` is the canonical way to add a user to a group.
// `loadMemberIdsForUser(userId)` returns all distinct user ids of fellow
// members across the user's groups (excluding self) — useful for "people in
// my groups" feeds.

export default class Member extends SupaModel {

  id = null;
  group_id = null;
  user_id = null;
  role = 'member';
  joined_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async load(id) {
    return this.loadModel(Member, 'members', { id });
  }

  async save() {
    return this.saveModel(Member, 'members', ['id', 'group_id', 'user_id', 'role'], ['id']);
  }

  async delete() {
    const success = await this.deleteModel(Member, 'members', { id: this.id });
    if (!success) throw new Error('Member.delete: failed');
  }

  static async findUserByEmail(email) {
    return this.findModel(User, 'users', { email: email.trim().toLowerCase() });
  }

  // Add a user to a group. RLS allows only the group owner to do this.
  static async invite(groupId, userId, role = 'member') {
    return this.insertModel('members', { group_id: groupId, user_id: userId, role });
  }

  // Distinct user ids of all members across groups the given user belongs
  // to, excluding the user themselves. Used for "people in your circles" lists.
  static async loadMemberIdsForUser(userId) {
    const client = useSupabaseClient();
    const { data: mine } = await client
      .from('members')
      .select('group_id')
      .eq('user_id', userId);
    const groupIds = (mine ?? []).map(m => m.group_id);
    if (!groupIds.length) return [];
    const { data: members } = await client
      .from('members')
      .select('user_id')
      .in('group_id', groupIds)
      .neq('user_id', userId);
    return [...new Set((members ?? []).map(m => m.user_id))];
  }
}
