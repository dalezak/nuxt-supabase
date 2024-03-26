export default class Models extends Array {

  constructor(modelClass, models = []) {
    super();
    if (models && models.length > 0) {
      for (let model of models) {
        this.push(new modelClass(model));
      }
    }
  }

  static async clearModels(prefix) {
    const Storage = useStorage();
    // consoleLog("Models.clearModels", this.name, prefix);
    return await Storage.clear(prefix);
  }

  async save() {
    // consoleLog("Models.save", this.constructor.name, this.length);
    for (let item of this) {
      if (typeof item.save === 'function') {
        item.save();
      }
    }
  }

  async store() {
    // consoleLog("Models.save", this.constructor.name, this.length);
    for (let item of this) {
      if (typeof item.store === 'function') {
        item.store();
      }
    }
  }

}