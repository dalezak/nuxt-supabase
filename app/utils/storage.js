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
    // Fields to search. With an explicit `haystack` we scan only those columns
    // (the norm — every app collection passes one, e.g. 'title,subtitle').
    // WITHOUT a haystack we fall back to EVERY field, which substring-matches
    // ids / timestamps / urls too and yields false positives — so always pass a
    // haystack when filtering a cache.
    const attributes = haystack && haystack.length > 0 ? haystack.split(",") : null;
    const values = attributes ? attributes.map(attr => item[attr]) : Object.values(item);
    for (let value of values) {
      if (value == null) continue;
      // Arrays (text[] columns, e.g. tags/topics) match if any ELEMENT contains
      // the term — substring, consistent with the scalar branch below (was an
      // exact whole-element match, an inconsistency).
      if (Array.isArray(value)) {
        if (value.some(v => v != null && v.toString().toLowerCase().includes(search))) return true;
      } else if (value.toString().toLowerCase().includes(search)) {
        return true;
      }
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
      const av = a[property];
      const bv = b[property];
      // Null/undefined sort LAST, regardless of direction — so a row missing the
      // sort field (e.g. a null `position`) lands in a stable, predictable spot
      // instead of comparing equal-to-everything and scattering.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "boolean") {
        return ((av === bv) ? 0 : av ? -1 : 1) * sortOrder;
      }
      if (typeof av === "number") {
        return (av - bv) * sortOrder;
      }
      return ((av < bv) ? -1 : (av > bv) ? 1 : 0) * sortOrder;
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
