import SupaModels from './SupaModels';
import Badge from './Badge';

export default class Badges extends SupaModels {

  constructor(models = []) {
    super(Badge, models);
  }

  // All badge definitions, ordered by name.
  static async load() {
    return this.loadModels(Badges, Badge, 'badges', {
      order: 'name:asc',
      limit: 100,
    });
  }

  // Badges earned by a user, hydrated with badge metadata + earned_at.
  // Joins awards → badges via Supabase nested select; transforms each row
  // into a Badge instance (so callers see Badge objects, not Award objects).
  static async loadForUser(userId) {
    return this.loadModels(Badges, Badge, 'awards', {
      select: 'earned_at, badges(id, type, name, description, icon)',
      where: [['user_id', 'eq', userId]],
      order: 'earned_at:desc',
      limit: 100,
      transform: (row) => new Badge({ ...row.badges, earned_at: row.earned_at }),
    });
  }
}
