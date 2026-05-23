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

  // Like loadModel but for optional lookups — logs at warn level (not error)
  // when the query returns null, since a missing record is a legitimate
  // outcome rather than a failure. Mirrors SupaModel.findModel semantics.
  static async findModel(modelClass, url, query, variables = {}, dataKey) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query, variables }
    });
    if (error.value) {
      consoleWarn("GraphModel.findModel", modelClass.name, error.value);
      return null;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleWarn("GraphModel.findModel", modelClass.name, payload.errors);
      return null;
    }
    const row = dataKey
      ? payload?.data?.[dataKey]
      : Object.values(payload?.data ?? {})[0];
    if (row) {
      consoleLog("GraphModel.findModel", modelClass.name, row);
      return new modelClass(row);
    }
    return null;
  }

  // POSTs a create mutation without rehydrating. Use when the caller doesn't
  // need the server response (mirrors SupaModel.insertModel). Throws on error.
  static async insertModel(url, mutation, variables = {}) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModel.insertModel", url, error.value);
      throw error.value;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.insertModel", url, payload.errors);
      throw payload.errors;
    }
  }

  // POSTs an update mutation without rehydrating. Use for partial updates
  // of fields that `getValues()` filters out, or when the response body
  // isn't needed. Throws on error.
  static async updateModel(url, mutation, variables = {}) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModel.updateModel", url, error.value);
      throw error.value;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.updateModel", url, payload.errors);
      throw payload.errors;
    }
  }

  // POSTs an upsert mutation without rehydrating. GraphQL has no native
  // upsert verb — the mutation string itself encodes the on-conflict
  // behavior (e.g. PostgREST/Hasura `on_conflict` clauses). Throws on error.
  static async upsertModel(url, mutation, variables = {}) {
    const { error, data: response } = await useFetch(url, {
      method: 'post',
      body: { query: mutation, variables }
    });
    if (error.value) {
      consoleError("GraphModel.upsertModel", url, error.value);
      throw error.value;
    }
    const payload = response.value;
    if (payload?.errors?.length) {
      consoleError("GraphModel.upsertModel", url, payload.errors);
      throw payload.errors;
    }
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
