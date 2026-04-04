import { createStorage } from "unstorage";
import indexedDbDriver from "unstorage/drivers/indexedb";
import localStorageDriver from "unstorage/drivers/localstorage";

export class Storage {

  static _instance;

  unstorage;

  static instance() {
    if (!this._instance) {
      this._instance = new Storage();
    }
    return this._instance;
  }

  constructor(name=null) {
    consoleLog("utils/storage")
    if (import.meta.client) {
      try {
        this.unstorage = createStorage({
          driver: indexedDbDriver({
            storeName: name || this.configAppName()
          })
        });
      }
      catch (error) {
        consoleError("utils/storage", error);
        this.unstorage = createStorage({
          driver: localStorageDriver()
        });
      }
    }
  }

  async keys(prefix = null) {
    if (!this.unstorage) return [];
    return await this.unstorage.getKeys(prefix);
  }

  async get(key) {
    if (!this.unstorage) return null;
    return await this.unstorage.getItem(key);
  }

  async set(key, value) {
    if (!this.unstorage) return null;
    return await this.unstorage.setItem(key, value ?? null);
  }

  // Note: loads all keys and items for the given prefix into memory before filtering.
  // Fine for small datasets; avoid for large collections.
  async count(prefix, needle = "", haystack = null) {
    if (!this.unstorage) return 0;
    let counts = 0;
    const keys = await this.unstorage.getKeys(prefix);
    const search = needle && needle.length > 0 ? needle.toLowerCase() : "";
    for (let key of keys) {
      const item = await this.get(key);
      if (item && this._matches(item, search, haystack)) {
        counts++;
      }
    }
    return counts;
  }

  // Note: loads all keys and items for the given prefix into memory before filtering.
  // Fine for small datasets; avoid for large collections.
  async search(prefix, needle = "", haystack = null, offset = 0, limit = 100, sort = null) {
    if (!this.unstorage) return [];
    let results = [];
    const keys = await this.unstorage.getKeys(prefix);
    const search = needle && needle.length > 0 ? needle.toLowerCase() : "";
    for (let key of keys) {
      const item = await this.get(key);
      if (item && this._matches(item, search, haystack)) {
        results.push(item);
      }
    }
    if (sort && sort.length > 0) {
      results = results.sort(this.sortByProperties(sort.split(",")));
    }
    return results.slice(offset, offset + limit);
  }

  async remove(key) {
    if (!this.unstorage) return null;
    return await this.unstorage.removeItem(key);
  }

  async clear(prefix = null) {
    if (!this.unstorage) return null;
    if (prefix && prefix.length > 0) {
      const keys = await this.unstorage.getKeys(prefix);
      for (let key of keys) {
        await this.unstorage.removeItem(key);
      }
      return true;
    }
    return await this.unstorage.clear();
  }

  _matches(item, search, haystack) {
    if (!search || search.length === 0) return true;
    const attributes = haystack && haystack.length > 0 ? haystack.split(",") : null;
    const values = attributes ? attributes.map(attr => item[attr]) : Object.values(item);
    for (let value of values) {
      if (value && Array.isArray(value) && value.includes(search)) return true;
      if (value && value.toString().toLowerCase().indexOf(search) !== -1) return true;
    }
    return false;
  }

  sortByProperties(properties) {
    return (a, b) => {
      let i = 0;
      let result = 0;
      while (result === 0 && i < properties.length) {
        result = this.sortByProperty(properties[i])(a, b);
        i++;
      }
      return result;
    };
  }

  sortByProperty(property) {
    let sortOrder = 1;
    if (property[0] === "-") {
      sortOrder = -1;
      property = property.slice(1);
    }
    return (a, b) => {
      if (typeof a[property] === "boolean") {
        return ((a[property] === b[property]) ? 0 : a[property] ? -1 : 1) * sortOrder;
      }
      if (typeof a[property] === "number") {
        return (a[property] - b[property]) * sortOrder;
      }
      return ((a[property] < b[property]) ? -1 : (a[property] > b[property])) * sortOrder;
    };
  }

  configAppName() {
    const config = useRuntimeConfig();
    if (config && config.public && config.public.app && config.public.app.name) {
      return config.public.app.name;
    }
    return null;
  }

}
