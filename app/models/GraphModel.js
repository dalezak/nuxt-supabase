import Model from './Model';

export default class GraphModel extends Model {

  constructor(data = {}) {
    super(data);
  }

  // Override in subclasses to load a single record from a GraphQL endpoint.
  // Typically delegates to loadModel(). Returns null by default.
  static async load(id) {
    return null;
  }

  // Override in subclasses to save to a GraphQL endpoint.
  // Typically delegates to saveModel(). Returns null by default.
  async save() {
    return null;
  }

  // Override in subclasses to delete from a GraphQL endpoint.
  // Typically delegates to deleteModel(). Returns false by default.
  async delete() {
    return false;
  }

  // POSTs a GraphQL query and returns a single hydrated modelClass instance.
  // query     — GraphQL query string
  // variables — plain object of query variables
  // dataKey   — field inside response.data to extract, e.g. 'user'
  //             defaults to the first key in response.data if omitted
  static async loadModel(modelClass, url, query, variables = {}, dataKey) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query, variables }
    });
    if (error.value) {
      consoleError("GraphModel.loadModel", modelClass.name, error.value);
      return null;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.loadModel", modelClass.name, payload.errors);
      return null;
    }
    const row = dataKey
      ? payload?.data?.[dataKey]
      : Object.values(payload?.data ?? {})[0];
    if (row) {
      consoleLog("GraphModel.loadModel", modelClass.name, row);
      return new modelClass(row);
    }
    return null;
  }

  // POSTs a GraphQL mutation and returns a freshly hydrated modelClass instance.
  // mutation  — GraphQL mutation string; subclass picks create vs update based on this.id
  // variables — plain object of mutation variables
  // dataKey   — field inside response.data to extract, e.g. 'createUser'
  //             defaults to the first key in response.data if omitted
  async saveModel(modelClass, url, mutation, variables = {}, dataKey) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModel.saveModel", modelClass.name, error.value);
      return null;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.saveModel", modelClass.name, payload.errors);
      return null;
    }
    const row = dataKey
      ? payload?.data?.[dataKey]
      : Object.values(payload?.data ?? {})[0];
    if (row) {
      consoleLog("GraphModel.saveModel", modelClass.name, row);
      return new modelClass(row);
    }
    return null;
  }

  // POSTs a GraphQL delete mutation.
  // Returns true on success, false on error or if the response contains errors.
  async deleteModel(modelClass, url, mutation, variables = {}) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModel.deleteModel", modelClass.name, error.value);
      return false;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.deleteModel", modelClass.name, payload.errors);
      return false;
    }
    consoleLog("GraphModel.deleteModel", modelClass.name, payload?.data);
    return true;
  }

}
