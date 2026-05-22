export default class Model {

  // Hydrates the model with plain data via `Object.assign`.
  //
  // ⚠️ Subclasses that add class-field initializers (e.g. `habit_id = null`)
  // MUST re-apply data in their own constructor:
  //
  //   class Reflection extends Model {
  //     habit_id = null;       // declared for IDE hints + default value
  //     constructor(data = {}) {
  //       super(data);          // base does Object.assign(this, data)
  //       Object.assign(this, data);  // re-apply — see note below
  //     }
  //   }
  //
  // Why: JS class-field initializers in derived classes run AFTER super()
  // returns but BEFORE the derived constructor body. So the sequence is:
  //   1. super(data) runs base constructor → sets `this.habit_id = data.habit_id`
  //   2. derived class fields run → `this.habit_id = null` (clobbers step 1)
  //   3. derived constructor body runs → second Object.assign restores it
  //
  // Subclasses without class-field initializers don't need the workaround.
  // The base constructor's assign is enough.
  constructor(data = {}) {
    Object.assign(this, data);
  }

  // Override in subclasses to delete from the backing store (DB or REST).
  // Returns null by default.
  async remove() {
    return null;
  }

  // Deletes this model from local storage at the given key.
  async removeModel(key) {
    const Storage = useStorage();
    consoleLog("Model.removeModel", this.constructor.name, key);
    return await Storage.remove(key);
  }

  // Override in subclasses to persist to local storage.
  // Typically delegates to storeModel(key). Returns null by default.
  async store() {
    return null;
  }

  // Persists this model to local storage under key.
  // If deleted_at is set, removes the entry instead and returns null.
  // Stores a plain JSON copy (not the class instance). Returns this on success.
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

  // Override in subclasses to load from local storage by id.
  // Typically delegates to restoreModel(modelClass, key). Returns null by default.
  static async restore(key) {
    return null;
  }

  // Reads a model from local storage by key and hydrates it as modelClass.
  // Returns null if no data is found (cache miss). Call before load() to
  // avoid an unnecessary DB/REST round-trip.
  static async restoreModel(modelClass, key) {
    const Storage = useStorage();
    let data = await Storage.get(key);
    if (data?.id) {
      let model = new modelClass(data);
      // consoleLog("Model.restoreModel", modelClass.name, key, data);
      return model;
    }
    // consoleLog("Model.restoreModel", modelClass.name, key, "Not Found");
    return null;
  }

  // Fields listed here are excluded from getAttributes().
  // Override in subclasses to add additional excluded field names:
  //   get excludedAttributes() { return [...super.excludedAttributes, 'secret'] }
  get excludedAttributes() {
    return ["id"];
  }

  // Field name suffixes excluded from getAttributes().
  // Override in subclasses to change which suffixes are excluded:
  //   get excludedSuffixes() { return ['_count'] }  // keeps _at fields
  get excludedSuffixes() {
    return ["_count", "_at"];
  }

  // Returns the list of own field names suitable for persistence —
  // excludes id, *_at, and *_count by default. Used by getValues() as the
  // fallback attribute list. Subclasses customise via excludedAttributes /
  // excludedSuffixes getters.
  getAttributes() {
    return Object.keys(this).filter(key =>
      !this.excludedAttributes.includes(key) &&
      !this.excludedSuffixes.some(suffix => key.endsWith(suffix))
    );
  }

  // Builds a plain { key: value } object for the given attribute names.
  // Pass an explicit attributes array (e.g. ["id","name","email"]) or leave
  // empty to use getAttributes(). Null values are omitted by default;
  // pass includeNulls = true to include them (needed for upsert-clearing a field).
  getValues(attributes=[], includeNulls = false) {
    let values = {}
    if (attributes == null || attributes.length == 0) {
      attributes = this.getAttributes();
    }
    let keys = Object.keys(this).filter(key => attributes.includes(key));
    for (let key of keys) {
      if (includeNulls || this[key] != null) {
        values[key] = this[key];
      }
    }
    return values;
  }

}
