import Model from './Model';

export default class SupaModel extends Model {

  // Opt-in local-storage caching. When true, the store's loadItem() restores
  // this model from cache first (pull-to-refresh / refresh:true busts it).
  // Set on stable reference/content models (lessons, modules); user-volatile
  // models leave it false so they always load fresh. Pairs with a `cacheKey`
  // override (below) so loadItem() has a key to restore/store under.
  static cacheable = false;

  constructor(data = {}) {
    super(data);
  }

  // Local-storage cache key for a single record, e.g. `lessons/${id}`.
  // Override in cacheable models — one source of truth that powers the
  // generic store() / restore() / evict() / stale() below, so a model
  // opts into caching by defining just this. Returns null (uncacheable)
  // by default. Models with a bespoke/composite key may instead override
  // store()/restore() directly (those win over the generic path here).
  static cacheKey(id) {
    return null;
  }

  // Generic cache ops derived from cacheKey — a model that defines cacheKey
  // gets all three without re-implementing them. No-ops when cacheKey is null.
  async store() {
    const key = this.constructor.cacheKey(this.id);
    return key ? this.storeModel(key) : null;
  }

  static async restore(id) {
    const key = this.cacheKey(id);
    return key ? this.restoreModel(this, key) : null;
  }

  static async evict(id) {
    const key = this.cacheKey(id);
    if (key) await useStorage().remove(key);
  }

  // Freshness check for a cached record against the server's marker value for
  // `id` — typically a timestamp (updated_at / recreated_at) fetched cheaply
  // in bulk for a list, then reconciled per row. Returns true when our cached
  // copy is present but its `field` differs (stale) and, by default, evicts it
  // so the next load re-fetches; false when nothing is cached or it matches.
  // Reusable by any cacheable model — the basis for stale-while-revalidate so
  // shared users pick up an owner's edit without a heavy fetch every visit.
  //   Lesson.stale(id, serverUpdatedAt)            // default field: updated_at
  //   Foo.stale(id, marker, { field: 'version' })  // override per model
  static async stale(id, marker, { field = 'updated_at', evict = true } = {}) {
    if (!id) return false;
    const cached = await this.restore(id);
    if (!cached) return false;
    if ((cached[field] ?? null) === (marker ?? null)) return false;
    if (evict) await this.evict(id);
    return true;
  }

  // Override in subclasses to load a single record from Supabase by id.
  // Typically delegates to loadModel(). Returns null by default.
  static async load(id) {
    return null;
  }

  // Override in subclasses to upsert/insert to Supabase.
  // Typically delegates to saveModel(). Returns null by default.
  async save() {
    return null;
  }

  // Override in subclasses to delete from Supabase.
  // Typically delegates to deleteModel(). Returns false by default.
  async delete() {
    return false;
  }

  // Like loadModel but uses maybeSingle() — returns null when no row matches
  // without treating zero rows as an error. Use for optional lookups (e.g. find
  // user by email) where the record may legitimately not exist.
  //   where   — plain object of AND equality conditions: { email: 'alice@example.com' }
  //   select  — Supabase select string, default '*'
  //   or      — Supabase OR filter string, e.g. 'user_id.eq.123,friend_id.eq.123'
  //   order   — 'column:asc' or 'column:desc' to return the first row by that
  //             ordering when multiple match (e.g. "latest rating per pillar").
  //             When supplied, implicitly adds `.limit(1)` so a non-unique
  //             where-clause returns the first ordered row instead of throwing
  //             on multiple matches. Omit for unique-or-null lookups (the
  //             original behavior — strict on >1 row).
  static async findModel(modelClass, table, where = {}, { select = '*', or = null, order = null } = {}) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).select(select);
    for (let key of Object.keys(where)) {
      if (where[key] == null) return null;
      query = query.eq(key, where[key]);
    }
    if (or) {
      query = query.or(or);
    }
    if (order) {
      const [column, direction] = order.split(':');
      query = query.order(column, { ascending: direction === 'asc' }).limit(1);
    }
    let { data: row, error } = await query.maybeSingle();
    if (error) {
      // maybeSingle() returns null data (no error) when no row matches, so any
      // error here is genuine — throw it (like the write methods) so a caller /
      // page can tell "the read failed" from "the record doesn't exist" instead
      // of the failure silently reading as "not found".
      consoleError("SupaModel.findModel", modelClass.name, error);
      throw error;
    }
    if (row) {
      consoleLog("SupaModel.findModel", modelClass.name, row);
      return new modelClass(row);
    }
    return null;
  }

  // Inserts a new row into table with the given values.
  // By default does not return the inserted row (avoids triggering a
  // separate RLS select). Pass `{ returning: true }` to get the inserted
  // row back via `.select().single()` — useful when the caller needs the
  // db-assigned id / defaults (e.g. lazily-created daily challenges).
  // Throws on error.
  static async insertModel(table, values, { returning = false } = {}) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).insert(values);
    if (returning) {
      const { data, error } = await query.select().single();
      if (error) {
        consoleError("SupaModel.insertModel", table, error);
        throw error;
      }
      return data;
    }
    const { error } = await query;
    if (error) {
      consoleError("SupaModel.insertModel", table, error);
      throw error;
    }
  }

  // Updates rows in table matching all `where` conditions (AND) with `values`.
  // Useful when callers need to write `*_at` columns or other fields that
  // `getValues()` filters out — `saveModel` strips suffix-matched fields,
  // so partial updates of timestamps go through here instead.
  // Returns the updated row when `where` targets a single row, or null on
  // error / no match. Throws on Supabase error.
  static async updateModel(table, where, values) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).update(values);
    for (let key of Object.keys(where)) {
      if (where[key] == null) return null;
      query = query.eq(key, where[key]);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) {
      consoleError("SupaModel.updateModel", table, error);
      throw error;
    }
    return data;
  }

  // Upserts a row into table. `onConflict` is a comma-separated string of
  // conflict columns, e.g. 'user_id,question_id'.
  //
  // `options` accepts either:
  //   - a boolean `ignoreDuplicates` (legacy positional shortcut), OR
  //   - an object `{ ignoreDuplicates, returning }`
  //     - `ignoreDuplicates` — do nothing on conflict (don't overwrite)
  //     - `returning` — fetch the upserted row back via .select().single()
  //
  // Without `returning`, returns nothing (avoids a separate RLS select).
  // Throws on error in either mode.
  static async upsertModel(table, values, onConflict, options = false) {
    const { ignoreDuplicates = false, returning = false } = typeof options === 'boolean'
      ? { ignoreDuplicates: options }
      : options;
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).upsert(values, { onConflict, ignoreDuplicates });
    if (returning) {
      const { data, error } = await query.select().single();
      if (error) {
        consoleError("SupaModel.upsertModel", table, error);
        throw error;
      }
      return data;
    }
    const { error } = await query;
    if (error) {
      consoleError("SupaModel.upsertModel", table, error);
      throw error;
    }
  }

  // Fetches a single row from table matching all where conditions (AND).
  // where is a plain object: { id: '123', email: 'alice@example.com' }.
  // Returns a hydrated modelClass instance, or null when no row matches.
  // PGRST116 (no rows) returns null (a legitimate "not found"); any OTHER error
  // is genuine and is thrown (like the write methods) so a caller / page can
  // tell "the read failed" (show an error/retry) from "the row doesn't exist"
  // instead of a failure silently reading as "not found".
  static async loadModel(modelClass, table, where = {}) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).select("*");
    for (let key of Object.keys(where)) {
      if (where[key] == null) return null;
      query = query.eq(key, where[key]);
    }
    let { data: row, error } = await query.single();
    if (error) {
      if (error.code == "PGRST116") return null;
      consoleError("SupaModel.loadModel", modelClass.name, error);
      throw error;
    }
    else if (row) {
      consoleLog("SupaModel.loadModel", modelClass.name, row);
      let model = new modelClass(row);
      return model;
    }
    return null;
  }

  // Inserts or upserts a row in table.
  // attributes — field names to include (passed to getValues()).
  // keys — fields used in the .eq() filter for upsert (default ['id']).
  // If this.id is set: upserts using keys as the conflict target.
  // If this.id is null/undefined: inserts a new row.
  // Returns a freshly hydrated modelClass instance from the DB response,
  // or null on error.
  async saveModel(modelClass, table, attributes = [], keys = ['id']) {
    const Supabase = useSupabaseClient();
    let values = this.getValues(attributes);
    if (!!this.id) {
      let query = Supabase.from(table).upsert(values);
      for (let key of keys) {
        query = query.eq(key, this[key]);
      }
      const { data, error } = await query.select()
      if (error) {
        consoleError("SupaModel.saveModel", modelClass.name, error);
      }
      else if (data) {
        consoleLog("SupaModel.saveModel", modelClass.name, data.at(0));
        let model = new modelClass(data.at(0));
        return model;
      }
      return null;
    }
    else {
      const { data: row, error } = await Supabase.from(table).insert(values).select();
      if (error) {
        consoleError("SupaModel.saveModel", modelClass.name, error);
      }
      else if (row) {
        consoleLog("SupaModel.saveModel", modelClass.name, row.at(0));
        let model = new modelClass(row.at(0));
        return model;
      }
      return null;
    }
  }

  // Deletes rows from table matching all where conditions (AND).
  // where is a plain object: { id: '123' }.
  // Returns true on success, false if where is empty or on error.
  async deleteModel(modelClass, table, where = {}) {
    const keys = where ? Object.keys(where) : [];
    if (keys && keys.length > 0) {
      const Supabase = useSupabaseClient();
      // .delete() must come BEFORE the filters — .eq() lives on the builder
      // returned by .delete(), not on .from(table) itself (supabase-js v2).
      // Same order as loadModel (.select().eq()) / saveModel (.upsert().eq()).
      let query = Supabase.from(table).delete();
      for (let key of keys) {
        query = query.eq(key, where[key]);
      }
      const { error } = await query;
      if (error) {
        consoleError("SupaModel.deleteModel", modelClass.name, error);
        return false;
      }
      return true;
    }
    return false;
  }

}
