import Models from './Models';
import RestModel from './RestModel';

export default class RestModels extends Models {

  // modelClass — class to instantiate for each item.
  // models — optional array of plain data to hydrate on construction.
  // Subclasses must pass both args through: super(modelClass, models).
  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

  // GETs url with optional params and returns a collectionClass instance
  // populated with modelClass instances.
  // params is a plain object appended as query string.
  // Returns null on error, empty collection if response is empty.
  static async loadModels(collectionClass, modelClass, url, params = {}) {
    let collection = new collectionClass();
    const { error, data: results } = await useFetch(url, {
      key: RestModel.urlQuery(url, params),
      params: params
    });
    if (error.value) {
      consoleError("RestModels.loadModels", collectionClass.name, error.value);
      return null;
    }
    else if (results && results.value) {
      consoleLog("RestModels.loadModels", collectionClass.name, results.value);
      for (let result of results.value) {
        let model = new modelClass(result);
        collection.push(model);
      }
    }
    return collection;
  }

  // GETs url and returns a row count without hydrating models. Mirrors
  // SupaModels.countModels — use this for digest cards / stat strips rather
  // than calling loadModels and reading `.length` (avoids fetching N rows
  // just to read the integer).
  //
  // Response contract — the endpoint may return any of:
  //   - a bare integer:        42
  //   - an envelope:           { count: 42 }
  //   - an X-Total-Count head: server sets header, body irrelevant
  //
  // Returns 0 on error.
  static async countModels(url, params = {}) {
    const { error, data: response, headers } = await useFetch(url, {
      key: RestModel.urlQuery(url, params),
      params: params
    });
    if (error.value) {
      consoleError("RestModels.countModels", url, error.value);
      return 0;
    }
    const totalHeader = headers?.value?.get?.('x-total-count');
    if (totalHeader != null) return parseInt(totalHeader, 10) || 0;
    const value = response?.value;
    if (typeof value === 'number') return value;
    if (value && typeof value.count === 'number') return value.count;
    return 0;
  }

  // DELETEs url with optional params for bulk deletion.
  // Semantics depend on the endpoint — typically a collection URL with
  // query-param filters (e.g. ?user_id=123). Throws on error.
  static async deleteModels(url, params = {}) {
    const { error } = await useFetch(url, {
      method: 'delete',
      params: params
    });
    if (error.value) {
      consoleError("RestModels.deleteModels", url, error.value);
      throw error.value;
    }
  }

}
