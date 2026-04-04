import Models from './Models';

export default class SupaModels extends Models {

  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

  static async loadModels(collectionClass, modelClass, tableName, { select = '*', limit = 10, offset = 0, where = [], order = null } = {}) {
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
        let model = new modelClass(row);
        collection.push(model);
      }
    }
    return collection;
  }

}