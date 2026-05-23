import Models from './Models';

export default class GraphModels extends Models {

  // modelClass — class to instantiate for each item.
  // models     — optional array of plain data to hydrate on construction.
  // Subclasses must pass both args through: super(modelClass, models).
  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

  // POSTs a GraphQL query and returns a collectionClass populated with modelClass instances.
  // query     — GraphQL query string
  // variables — plain object of query variables
  // dataKey   — field inside response.data that holds the array, e.g. 'users'
  //             defaults to the first key in response.data if omitted
  // Returns null on error, empty collection if response data is empty.
  static async loadModels(collectionClass, modelClass, url, query, variables = {}, dataKey) {
    let collection = new collectionClass();
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query, variables }
    });
    if (error.value) {
      consoleError("GraphModels.loadModels", collectionClass.name, error.value);
      return null;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModels.loadModels", collectionClass.name, payload.errors);
      return null;
    }
    const results = dataKey
      ? payload?.data?.[dataKey]
      : Object.values(payload?.data ?? {})[0];
    if (results) {
      consoleLog("GraphModels.loadModels", collectionClass.name, results);
      for (let result of results) {
        collection.push(new modelClass(result));
      }
    }
    return collection;
  }

  // POSTs a GraphQL aggregate query and returns a scalar count. Mirrors
  // SupaModels.countModels — use this for digest cards / stat strips rather
  // than calling loadModels and reading `.length`.
  //
  // query    — aggregate query string, e.g.:
  //              query($where: UserFilter) {
  //                usersCount(where: $where)
  //              }
  // dataKey  — field inside response.data that holds the integer, e.g.
  //            'usersCount'. Defaults to the first key in response.data.
  //            The resolved value may be a bare integer or an envelope like
  //            { count: 42 } / { aggregate: { count: 42 } } (Hasura shape).
  //
  // Returns 0 on error.
  static async countModels(url, query, variables = {}, dataKey) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query, variables }
    });
    if (error.value) {
      consoleError("GraphModels.countModels", url, error.value);
      return 0;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModels.countModels", url, payload.errors);
      return 0;
    }
    const value = dataKey
      ? payload?.data?.[dataKey]
      : Object.values(payload?.data ?? {})[0];
    if (typeof value === 'number') return value;
    if (typeof value?.count === 'number') return value.count;
    if (typeof value?.aggregate?.count === 'number') return value.aggregate.count;
    return 0;
  }

  // POSTs a bulk-delete mutation. Semantics depend on the schema — typically
  // a `deleteMany` / `delete_<table>` mutation with a where-clause variable.
  // Throws on error.
  static async deleteModels(url, mutation, variables = {}) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModels.deleteModels", url, error.value);
      throw error.value;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModels.deleteModels", url, payload.errors);
      throw payload.errors;
    }
  }

}
