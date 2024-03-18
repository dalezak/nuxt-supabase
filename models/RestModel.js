import Model from './Model';

export default class RestModel extends Model {

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }
  
  static async load(id) {
    return null;
  }

  async save() {
    return null;
  }

  async delete() {
    return false;
  }

  static async loadModel(modelClass, url, params = {}) {
    const { error, data: response } = await useFetch(url, {
      key: RestModel.urlQuery(url, params),
      params: params,
      initialCache: false
    });
    if (error.value) {
      consoleError("RestModel.loadModel", modelClass.name, error.value);
      return null;
    }
    else if (response.value) {
      consoleLog("RestModel.loadModel", modelClass.name, response.value);
      let model = new modelClass(response.value);
      return model;
    }
    return null;
  }

  async saveModel(modelClass, url, values = {}) {
    const method = this.id != null ? 'put' : 'post';
    const { error, data: response } = await useFetch(url, {
      method: method,
      body: values
    });
    if (error.value) {
      consoleError("RestModel.saveModel", modelClass.name, error.value);
      return null;
    }
    else if (response.value) {
      consoleLog("RestModel.saveModel", modelClass.name, response.value);
      let model = new modelClass(response.value);
      return model;
    }
    return null;
  }

  async deleteModel(modelClass, url) {
    const { error, data: response } = await useFetch(url, {
      method: 'delete'
    });
    if (error.value) {
      consoleError("RestModel.deleteModel", modelClass.name, error.value);
      return false;
    }
    else if (response.value) {
      consoleLog("RestModel.deleteModel", modelClass.name, response.value);
      return true;
    }
    return false;
  }

  static urlQuery(url, params ={}) {
    const urlPath = new URL(url);
    for (let key in params) {
      urlPath.searchParams.append(key, params[key]);
    }
    return urlPath.href;
  }

}