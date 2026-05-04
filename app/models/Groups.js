import SupaModels from './SupaModels';
import Group from './Group';

export default class Groups extends SupaModels {

  constructor(models = []) {
    super(Group, models);
  }

  // Groups the user belongs to (as owner OR member). Joins members to find
  // group ids the user is in, then returns the corresponding Group rows.
  // Visibility relies on the layer's RLS — owner OR is_group_member can read.
  static async loadForUser(userId) {
    const client = useSupabaseClient();
    const { data: rows } = await client
      .from('groups')
      .select('*, members!inner(user_id)')
      .eq('members.user_id', userId)
      .order('created_at', { ascending: false });
    return (rows ?? []).map(r => new Group(r));
  }
}
