import Model from './Model';

export default class RestModel extends Model {

  constructor(data = {}) {
    super(data);
  }

  // Override in subclasses to load a single record from a REST endpoint.
  // Typically delegates to loadModel(). Returns null by default.
  static async load(id) {
    return null;
  }

  // Override in subclasses to save to a REST endpoint.
  // Typically delegates to saveModel(). Returns null by default.
  async save() {
    return null;
  }

  // Override in subclasses to delete from a REST endpoint.
  // Typically delegates to deleteModel(). Returns false by default.
  async delete() {
    return false;
  }

  // GETs url with optional params and returns a hydrated modelClass instance.
  // params is a plain object appended as query string.
  // Returns null on error or empty response.
  static async loadModel(modelClass, url, params = {}) {
    const { error, data: response } = await useFetch(url, {
      key: this.urlQuery(url, params),
      params: params
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

  // Like loadModel but for optional lookups — logs at warn level (not error)
  // when the endpoint returns 404 / empty, since "not found" is a legitimate
  // outcome rather than a failure. Mirrors SupaModel.findModel semantics for
  // REST APIs where the same resource may or may not exist.
  static async findModel(modelClass, url, params = {}) {
    const { error, data: response } = await useFetch(url, {
      key: this.urlQuery(url, params),
      params: params
    });
    if (error.value) {
      consoleWarn("RestModel.findModel", modelClass.name, error.value);
      return null;
    }
    else if (response.value) {
      consoleLog("RestModel.findModel", modelClass.name, response.value);
      return new modelClass(response.value);
    }
    return null;
  }

  // POSTs values to url to create a new resource.
  // Does not return a hydrated model (mirrors SupaModel.insertModel — avoids
  // an extra round-trip when the caller doesn't need the server response).
  // Throws on error.
  static async insertModel(url, values = {}) {
    const { error } = await useFetch(url, {
      method: 'post',
      body: values
    });
    if (error.value) {
      consoleError("RestModel.insertModel", url, error.value);
      throw error.value;
    }
  }

  // PATCHes (default) or PUTs values to url to partially update a resource.
  // Use this when the caller needs to write fields that `getValues()` filters
  // out (timestamps, server-managed fields) or when the response body isn't
  // needed. Throws on error.
  static async updateModel(url, values = {}, method = 'patch') {
    const { error } = await useFetch(url, {
      method: method,
      body: values
    });
    if (error.value) {
      consoleError("RestModel.updateModel", url, error.value);
      throw error.value;
    }
  }

  // POSTs (insert) or PUTs (update) values to url.
  // Uses PUT when this.id is set, POST otherwise.
  // Returns a freshly hydrated modelClass instance, or null on error.
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

  // DELETEs the resource at url.
  // Returns true on success, false on error or empty response.
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

  // Builds a cache key by appending params to url as a query string.
  // Used as the useFetch key to ensure distinct cache entries per param set.
  static urlQuery(url, params = {}) {
    const urlPath = new URL(url);
    if (params) {
      for (let key in params) {
        urlPath.searchParams.append(key, params[key]);
      }
    }
    return urlPath.href;
  }

}
