import SupaModel from './SupaModel';

// Base for models with a SOFT-RETIRE lifecycle: an `archived_at` timestamp
// instead of a hard delete, so history (and any scoped children — ratings,
// cycles, etc.) survive. The subclass owns its table, columns, and `save()`;
// this base adds the shared lifecycle every archivable model was repeating:
// the `isActive` / `isArchived` getters and a no-op-if-already-set `archive()`
// that stamps `archived_at` and persists via the subclass's save().
//
// Usage: `class Relationship extends Archivable { ... async save() {...} }` —
// the subclass MUST include `archived_at` in its save-list column set.
export default class Archivable extends SupaModel {
  archived_at = null;

  get isActive() {
    return !this.archived_at;
  }

  get isArchived() {
    return !!this.archived_at;
  }

  // Soft-retire — no-op when already archived (the timestamp shouldn't move).
  // Persists via the subclass's save(). Returns the model.
  async archive() {
    if (this.archived_at) return this;
    this.archived_at = new Date().toISOString();
    return this.save();
  }
}
