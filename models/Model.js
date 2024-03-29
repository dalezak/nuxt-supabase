export default class Model {

  constructor(data = {}) {
    Object.assign(this, data);
  }

  async remove() {
    return null;
  }

  async removeModel(key) {
    const Storage = useStorage();
    consoleLog("Model.removeModel", this.constructor.name, key);
    return await Storage.remove(key);
  }

  async store() {
    return null;
  }

  async storeModel(key) {
    const Storage = useStorage();
    if (this.deleted_at && this.deleted_at.length > 0) {
      await Storage.remove(key);
      // consoleLog("Model.storeModel", this.constructor.name, key, "Deleted");
      return null;
    }
    else {
      const json = JSON.stringify(this);
      const data = JSON.parse(json);
      await Storage.set(key, data);
      // consoleLog("Model.storeModel", this.constructor.name, key, data);
      return this;
    }
  }

  static async restore(key) {
    return null;
  }

  static async restoreModel(modelClass, key) {
    const Storage = useStorage();
    let data = await Storage.get(key);
    if (data) {
      let model = new modelClass(data);
      // consoleLog("Model.restoreModel", modelClass.name, key, data);
      return model;
    }
    // consoleLog("Model.restoreModel", modelClass.name, key, "Not Found");
    return null;
  }

  getAttributes() {
    return Object.keys(this).filter(key => key != "id" && key.endsWith("_count") == false && key.endsWith("_at") == false);
  }

  getValues(attributes=[]) {
    let values = {}
    if (attributes == null || attributes.length == 0) {
      attributes = this.getAttributes();
    }
    let keys = Object.keys(this).filter(key => attributes.includes(key));
    for (let key of keys) {
      if (this[key] != null) {
        values[key] = this[key];
      }
    }
    return values;
  }

}