import SupaModel from './SupaModel';

// Group: an owner-created shared circle. Members join via the members table.
// Generic — apps add their own group-scoped resources (shared lessons, shared
// practices, shared feeds) as separate tables and RLS policies in their own
// migrations.
//
// Cached locally — groups are slowly-changing; restored by the standard
// store/restore path.

export default class Group extends SupaModel {

  id = null;
  owner_id = null;
  name = null;
  description = null;
  created_at = null;
  updated_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  async store() {
    return this.storeModel(`groups/${this.id}`);
  }

  static async restore(id) {
    return this.restoreModel(Group, `groups/${id}`);
  }

  static async load(id) {
    return this.loadModel(Group, 'groups', { id });
  }

  async save() {
    return this.saveModel(Group, 'groups', ['id', 'owner_id', 'name', 'description'], ['id']);
  }

  async delete() {
    const success = await this.deleteModel(Group, 'groups', { id: this.id });
    if (!success) throw new Error('Group.delete: failed');
  }
}
