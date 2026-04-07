export default class Models extends Array {

  // modelClass — the class to instantiate for each item (e.g. User).
  // models — optional array of plain data objects to hydrate on construction.
  // Subclasses must pass both args through: super(modelClass, models).
  constructor(modelClass, models = []) {
    super();
    if (models && models.length > 0) {
      for (let model of models) {
        this.push(new modelClass(model));
      }
    }
  }

  // Removes all items from local storage under prefix.
  // Delegates to Storage.clear(prefix). Call from a static clear() on the
  // subclass, e.g: static async clear() { return Models.clearModels('users') }
  static async clearModels(prefix) {
    const Storage = useStorage();
    // consoleLog("Models.clearModels", this.name, prefix);
    return await Storage.clear(prefix);
  }

  // Calls save() on every item in the collection sequentially.
  // Items without a save() method are skipped.
  async save() {
    // consoleLog("Models.save", this.constructor.name, this.length);
    for (let item of this) {
      if (typeof item.save === 'function') {
        await item.save();
      }
    }
  }

  // Calls store() on every item in the collection sequentially,
  // persisting each to local storage. Items without a store() method are skipped.
  async store() {
    // consoleLog("Models.store", this.constructor.name, this.length);
    for (let item of this) {
      if (typeof item.store === 'function') {
        await item.store();
      }
    }
  }

  // Override in subclasses to restore a collection from local storage.
  // Typically delegates to restoreModels(). Returns null by default.
  static async restore() {
    return null;
  }

  // Reads a collection from local storage and returns a collectionClass instance
  // populated with modelClass instances. Mirrors the loadModels() signature so
  // callers can swap between DB and cache transparently.
  //   prefix   — storage key prefix, e.g. 'users'
  //   search   — optional search string filtered across item fields
  //   offset   — pagination offset
  //   limit    — max items to return
  //   sort     — comma-separated sort fields, prefix with '-' for descending, e.g. '-created_at'
  //   haystack — comma-separated field names to restrict search to, or null for all fields
  // Always returns a collection (never null), empty if nothing is found.
  static async restoreModels(collectionClass, modelClass, prefix, search = "", offset = 0, limit = 10, sort = "created_at", haystack = null) {
    const Storage = useStorage();
    const collection = new collectionClass();
    const items = await Storage.search(prefix, search, haystack, offset, limit, sort);
    for (let item of items ?? []) {
      collection.push(new modelClass(item));
    }
    return collection;
  }

  // Returns the number of items in local storage under prefix matching search.
  //   prefix   — storage key prefix, e.g. 'users'
  //   search   — optional search string filtered across item fields
  //   haystack — comma-separated field names to restrict search to, or null for all fields
  // Use this to decide whether to restore from cache or load from DB.
  // Returns 0 if storage is unavailable or no items match.
  static async countModels(prefix, search = "", haystack = null) {
    const Storage = useStorage();
    return await Storage.count(prefix, search, haystack);
  }
}
