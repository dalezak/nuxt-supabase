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
    if (import.meta.client) {
      return await this.unstorage.getKeys(prefix);
    }
    return [];
  }

  async get(key) {
    if (import.meta.client) {
      return await this.unstorage.getItem(key);
    }
    return null;
  }

  async set(key, value) {
    if (import.meta.client) {
      if (value) {
        return await this.unstorage.setItem(key, value);
      }
      return await this.unstorage.setItem(key, null);
    }
    return null;
  }

  // Note: loads all keys and items for the given prefix into memory before filtering.
  // Fine for small datasets; avoid for large collections.
  async count(prefix, needle = "", haystack = null) {
    if (import.meta.client) {
      let counts = 0;
      let keys = await this.unstorage.getKeys(prefix);
      let search = needle && needle.length > 0 ? needle.toLowerCase() : "";
      for (let key of keys) {
        const item = await this.get(key);
        if (item) {
          if (search && search.length > 0) {
            if (haystack && haystack.length > 0) {
              for (let attribute of haystack.split(",")) {
                let value = item[attribute];
                if (value && Array.isArray(value) && value.includes(search)) {
                  counts = counts + 1;
                  break;
                }
                else if (value && value.toString().toLowerCase().indexOf(search) != -1) {
                  counts = counts + 1;
                  break;
                }
              }
            }
            else {
              for (let value of Object.values(item)) {
                if (value && value.toString().toLowerCase().indexOf(search) != -1) {
                  counts = counts + 1;
                  break;
                }
              }
            }
          }
          else {
            counts = counts + 1;
          }
        }
      }
      return counts;
    }
    return 0;
  }

  // Note: loads all keys and items for the given prefix into memory before filtering.
  // Fine for small datasets; avoid for large collections.
  async search(prefix, needle = "", haystack = null, offset = 0, limit = 100, sort = null) {
    if (import.meta.client) {
      let results = [];
      let keys = await this.unstorage.getKeys(prefix);
      let search = needle && needle.length > 0 ? needle.toLowerCase() : "";
      for (let key of keys) {
        const item = await this.get(key);
        if (item) {
          if (search && search.length > 0) {
            if (haystack && haystack.length > 0) {
              for (let attribute of haystack.split(",")) {
                let value = item[attribute];
                if (value && Array.isArray(value) && value.includes(search)) {
                  results.push(item);
                  break;
                }
                else if (value && value.toString().toLowerCase().indexOf(search) != -1) {
                  results.push(item);
                  break;
                }
              }
            }
            else {
              for (let value of Object.values(item)) {
                if (value && value.toString().toLowerCase().indexOf(search) != -1) {
                  results.push(item);
                  break;
                }
              }
            }
          }
          else {
            results.push(item);
          }
        }
      }
      if (sort && sort.length > 0) {
        return results.sort(sortByProperties(sort.split(","))).slice(offset, offset + limit);
      }
      return results.slice(offset, offset + limit);
    }
    return [];
  }

  async remove(key) {
    if (import.meta.client) {
      return await this.unstorage.removeItem(key);
    }
    return null;
  }

  async clear(prefix = null) {
    if (import.meta.client) {
      if (prefix && prefix.length > 0) {
        let keys = await this.unstorage.getKeys(prefix);
        for (let key of keys) {
          await this.unstorage.removeItem(key);
        }
        return true;
      }
      return await this.unstorage.clear();
    }
    return null;
  }

  sortByProperties(properties) {
    if (import.meta.client) {
      return (a, b) => {
        let i = 0;
        let result = 0;
        let numberOfProperties = properties.length;
        while (result === 0 && i < numberOfProperties) {
          result = this.sortByProperty(properties[i])(a, b);
          i++;
        }
        return result;
      };
    }
    return [];
  }

  sortByProperty(property) {
    if (import.meta.client) {
      let sortOrder = 1;
      if (property[0] === "-") {
        sortOrder = -1;
        property = property.slice(1);
      }
      return (a, b) => {
        if (typeof a[property] == "boolean") {
          return ((a[property] === b[property]) ? 0 : a[property] ? -1 : 1) * sortOrder;
        }
        if (typeof a[property] == "number") {
          return (a[property] - b[property]) * sortOrder;
        }
        return ((a[property] < b[property]) ? -1 : (a[property] > b[property])) * sortOrder;
      };
    }
    return [];
  }

  configAppName() {
    const config = useRuntimeConfig();
    if (config && config.public && config.public.app && config.public.app.name) {
      return config.public.app.name;
    }
    return process.env.APP_NAME;
  }

}