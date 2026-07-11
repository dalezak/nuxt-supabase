import Models from './Models';

export default class SupaModels extends Models {

  // Operators whose values are wrapped in `%` for substring matching.
  // Used by `applyWhereClauses` to auto-wrap `like` / `ilike` (and their
  // `not_` negations).
  static LIKE_OPERATORS = new Set(["ilike", "like"]);

  // modelClass — class to instantiate for each item (e.g. User).
  // models — optional array of plain data to hydrate on construction.
  // Subclasses must pass both args through: super(modelClass, models).
  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

  // Applies an array of [column, operator, value] triples to a Supabase
  // query builder. Centralized so loadModels / countModels / deleteModels
  // stay in lock-step on operator semantics — adding a new operator here
  // makes it available to all three.
  //
  // Supports two operator forms:
  //   - Direct builder method:  ['name', 'eq', 'Alice']           → query.eq(...)
  //   - Negated builder method: ['pillar_id', 'not_is', null]     → query.not('pillar_id', 'is', null)
  //
  // `like` / `ilike` values are auto-wrapped in `%` for substring matching
  // (covers both direct and `not_like` / `not_ilike` forms).
  static applyWhereClauses(query, where) {
    for (const clause of where ?? []) {
      const column = clause.at(0);
      const operator = clause.at(1);
      const value = clause.at(2);
      if (operator.startsWith('not_')) {
        const subOp = operator.slice(4);
        const v = this.LIKE_OPERATORS.has(subOp) ? `%${value}%` : value;
        query = query.not(column, subOp, v);
        continue;
      }
      if (typeof query[operator] === 'function') {
        const v = this.LIKE_OPERATORS.has(operator) ? `%${value}%` : value;
        query = query[operator](column, v);
      }
    }
    return query;
  }

  // Deletes rows from tableName matching the given where clauses.
  // where — array of [column, operator, value] triples (same format as
  // loadModels — see that method's docstring for the full operator list,
  // including contains / containedBy / overlaps for JSONB and array
  // columns, and in for set membership; `not_<op>` for negation, e.g.
  // ['pillar_id', 'not_is', null]).
  // Throws on error.
  static async deleteModels(tableName, where = []) {
    const Supabase = useSupabaseClient();
    let query = this.applyWhereClauses(Supabase.from(tableName).delete(), where);
    const { error } = await query;
    if (error) {
      consoleError("SupaModels.deleteModels", tableName, error);
      throw error;
    }
  }

  // Returns the total count of rows in tableName matching the given where clauses.
  // where — array of [column, operator, value] triples (same format as loadModels).
  // Throws on a genuine Supabase error (a count of zero is a valid result, not an
  // error) so callers can tell "no rows" from "the read failed" — mirroring the
  // write methods, which already throw. Stores re-reject, so pages can branch on
  // error vs empty instead of a failure masquerading as an empty table.
  static async countModels(tableName, where = []) {
    const Supabase = useSupabaseClient();
    let query = this.applyWhereClauses(
      Supabase.from(tableName).select('id', { count: 'exact', head: true }),
      where,
    );
    const { count, error } = await query;
    if (error) {
      consoleError("SupaModels.countModels", tableName, error);
      throw error;
    }
    return count ?? 0;
  }

  // Queries tableName and returns a collectionClass instance populated with
  // modelClass instances.
  //
  // Options:
  //   select    — Supabase select string, default '*'. Supports joins e.g. '*, users(id, name)'
  //               and PostgREST FK shorthand e.g. 'inviter:users!inviter_id(id, name)'.
  //   limit     — max rows to return, default 10
  //   offset    — row offset for pagination, default 0
  //   order     — 'column:asc' or 'column:desc', e.g. 'created_at:desc'
  //   where     — array of [column, operator, value] triples, e.g.:
  //                 [['name', 'eq', 'Alice'], ['age', 'gte', 18]]
  //               Operator is looked up directly on the Supabase query builder,
  //               so any builder method works. Common operators:
  //                 - Equality / comparison: eq, neq, gt, gte, lt, lte
  //                 - Pattern matching:      like, ilike (auto-wrapped in %)
  //                 - Null / boolean:        is
  //                 - Sets:                  in
  //                 - Array / JSONB:         contains, containedBy, overlaps
  //                 - Negation:              not_<op>, e.g. ['pillar_id', 'not_is', null]
  //                                          or ['title', 'not_ilike', 'draft']
  //                 - Full-text search:      textSearch
  //                 - Range:                 rangeGt, rangeGte, rangeLt, rangeLte, rangeAdjacent
  //               Use these directly — no need to drop to raw `client.from()`.
  //   or        — Supabase OR filter string, e.g. 'user_id.eq.123,friend_id.eq.123'
  //   transform — optional function(row) => modelClass instance, for when rows need
  //               reshaping before hydration (e.g. joining awards → Badge instances)
  //
  // Returns a collectionClass instance (empty when no rows match — that is a
  // valid result, not an error). Throws on a genuine Supabase error, mirroring
  // the write methods (saveModels/deleteModels already throw). Stores re-reject
  // on the thrown error, so a page can distinguish "the read failed" (show an
  // error/retry) from "there are no rows" (show an empty state) instead of a
  // failure silently masquerading as an empty table.
  static async loadModels(collectionClass, modelClass, tableName, { select = '*', limit = 10, offset = 0, where = [], order = null, or = null, transform = null } = {}) {
    const Supabase = useSupabaseClient();
    let collection = new collectionClass();
    let query = Supabase.from(tableName).select(select);
    query = query.range(offset, offset+limit-1);
    query = this.applyWhereClauses(query, where);
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
      throw error;
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
