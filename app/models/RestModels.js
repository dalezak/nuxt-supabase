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

}
