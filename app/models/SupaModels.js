import Models from './Models';

export default class SupaModels extends Models {

  // modelClass — class to instantiate for each item (e.g. User).
  // models — optional array of plain data to hydrate on construction.
  // Subclasses must pass both args through: super(modelClass, models).
  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

  // Deletes rows from tableName matching the given where clauses.
  // where — array of [column, operator, value] triples (same format as loadModels).
  // Supports any Supabase filter method including contains, in, etc.
  // Throws on error.
  static async deleteModels(tableName, where = []) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(tableName).delete();
    for (let clause of where) {
      let column = clause.at(0);
      let operator = clause.at(1);
      let value = clause.at(2);
      if (typeof query[operator] === 'function') {
        query = query[operator](column, value);
      }
    }
    const { error } = await query;
    if (error) {
      consoleError("SupaModels.deleteModels", tableName, error);
      throw error;
    }
  }

  // Returns the total count of rows in tableName matching the given where clauses.
  // where — array of [column, operator, value] triples (same format as loadModels).
  // Returns 0 on error.
  static async countModels(tableName, where = []) {
    const Supabase = useSupabaseClient();
    let query = Supabase.from(tableName).select('id', { count: 'exact', head: true });
    for (let clause of where) {
      let column = clause.at(0);
      let operator = clause.at(1);
      let value = clause.at(2);
      if (typeof query[operator] === 'function') {
        query = query[operator](column, value);
      }
    }
    const { count, error } = await query;
    if (error) {
      consoleError("SupaModels.countModels", tableName, error);
      return 0;
    }
    return count ?? 0;
  }

  // Queries tableName and returns a collectionClass instance populated with
  // modelClass instances.
  //
  // Options:
  //   select    — Supabase select string, default '*'. Supports joins e.g. '*, users(id, name)'
  //   limit     — max rows to return, default 10
  //   offset    — row offset for pagination, default 0
  //   order     — 'column:asc' or 'column:desc', e.g. 'created_at:desc'
  //   where     — array of [column, operator, value] triples, e.g.:
  //                 [['name', 'eq', 'Alice'], ['age', 'gte', 18]]
  //               Supported operators: eq, neq, gt, lt, gte, lte, ilike,
  //               like, is, not, in, cs, cd. ilike/like auto-wrap value in %.
  //   or        — Supabase OR filter string, e.g. 'user_id.eq.123,friend_id.eq.123'
  //   transform — optional function(row) => modelClass instance, for when rows need
  //               reshaping before hydration (e.g. joining awards → Badge instances)
  //
  // Returns an empty collection on error (never null).
  static async loadModels(collectionClass, modelClass, tableName, { select = '*', limit = 10, offset = 0, where = [], order = null, or = null, transform = null } = {}) {
    const Supabase = useSupabaseClient();
    let collection = new collectionClass();
    let query = Supabase.from(tableName).select(select);
    query = query.range(offset, offset+limit-1);
    if (where && where.length > 0) {
      const wrapLike = new Set(["ilike", "like"]);
      for (let clause of where) {
        let column = clause.at(0);
        let operator = clause.at(1);
        let value = clause.at(2);
        if (typeof query[operator] === 'function') {
          query = query[operator](column, wrapLike.has(operator) ? `%${value}%` : value);
        }
      }
    }
    if (or) {
      query = query.or(or);
    }
    if (order) {
      let sorting = order.split(":");
      let ordering = sorting.at(0);
      let ascending = sorting.length > 1 && sorting.at(1) == "asc";
      query = query.order(ordering, { ascending: ascending })
    }
    const { data: rows, error } = await query;
    if (error) {
      consoleError("SupaModels.loadModels", collectionClass.name, error);
    }
    else if (rows && rows.length > 0) {
      consoleLog("SupaModels.loadModels", collectionClass.name, rows);
      for (let row of rows) {
        let model = transform ? transform(row) : new modelClass(row);
        collection.push(model);
      }
    }
    return collection;
  }

}
