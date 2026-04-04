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

}
