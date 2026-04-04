import Model from './Model';

export default class SupaModel extends Model {

  constructor(data = {}) {
    super(data);
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
  static async findModel(modelClass, table, where = {}) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).select("*");
    for (let key of Object.keys(where)) {
      if (where[key] == null) return null;
      query = query.eq(key, where[key]);
    }
    let { data: row, error } = await query.maybeSingle();
    if (error) {
      consoleWarn("SupaModel.findModel", modelClass.name, error);
      return null;
    }
    if (row) {
      consoleLog("SupaModel.findModel", modelClass.name, row);
      return new modelClass(row);
    }
    return null;
  }

  // Inserts a new row into table with the given values.
  // Does not return the inserted row (avoids triggering a separate RLS select).
  // Throws on error.
  static async insertModel(table, values) {
    const Supabase = useSupabaseClient();
    const { error } = await Supabase.from(table).insert(values);
    if (error) {
      consoleError("SupaModel.insertModel", table, error);
      throw error;
    }
  }

  // Upserts a row into table. onConflict is a comma-separated string of
  // conflict columns, e.g. 'user_id,question_id'.
  // Does not return the upserted row. Throws on error.
  static async upsertModel(table, values, onConflict) {
    const Supabase = useSupabaseClient();
    const { error } = await Supabase.from(table).upsert(values, { onConflict });
    if (error) {
      consoleError("SupaModel.upsertModel", table, error);
      throw error;
    }
  }

  // Fetches a single row from table matching all where conditions (AND).
  // where is a plain object: { id: '123', email: 'alice@example.com' }.
  // Returns a hydrated modelClass instance, or null if not found or on error.
  // PGRST116 (no rows) is silently ignored; all other errors are logged.
  static async loadModel(modelClass, table, where = {}) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(table).select("*");
    for (let key of Object.keys(where)) {
      if (where[key] == null) return null;
      query = query.eq(key, where[key]);
    }
    let { data: row, error } = await query.single();
    if (error) {
      if (error.code != "PGRST116") {
        consoleWarn("SupaModel.loadModel", modelClass.name, error);
      }
      return null;
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
      let query = Supabase.from(table);
      for (let key of keys) {
        query = query.eq(key, where[key]);
      }
      const { error } = await query.delete();
      if (error) {
        consoleError("SupaModel.deleteModel", modelClass.name, error);
        return false;
      }
      return true;
    }
    return false;
  }

}
