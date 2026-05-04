import SupaModels from './SupaModels';
import Member from './Member';

export default class Members extends SupaModels {

  constructor(models = []) {
    super(Member, models);
  }

  static async loadForGroup(groupId) {
    return this.loadModels(Members, Member, 'members', {
      select: '*, users(id, name, email)',
      where: [['group_id', 'eq', groupId]],
      order: 'joined_at:asc',
      limit: 1000,
    });
  }
}
