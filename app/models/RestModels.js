import Models from './Models';
import RestModel from './RestModel';

export default class RestModels extends Models {

  constructor(modelClass, models = []) {
    super(modelClass, models);
  }

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