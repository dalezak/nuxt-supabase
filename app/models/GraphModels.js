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

}
