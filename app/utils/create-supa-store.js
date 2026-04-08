import { defineStore } from 'pinia';

export function createSupaStore(name, ModelClass, CollectionClass) {
  return defineStore(name, {
    state: () => ({
      item: null,
      items: null
    }),
    getters: {
      getItems(state) {
        return state.items;
      },
      getItem(state) {
        return (id) => {
          if (state.items && state.items.length > 0 && id) {
            return state.items.find(item => item.id == id);
          }
          return state.item;
        };
      }
    },
    actions: {
      async loadItems({ limit = 10, offset = 0, search = null, refresh = false, params = {} } = {}) {
        consoleLog(`[${name}] loadItems called (refresh=${refresh}, offset=${offset}, items=${this.items?.length ?? 'null'})`);
        try {
          // In-memory hit: first page already loaded, skip all I/O
          if (!refresh && offset === 0 && this.items != null && this.items.length <= limit) {
            consoleLog(`[${name}] loadItems memory cache (${this.items.length} items)`);
            return Promise.resolve(this.items);
          }
          let items = null;
          // Only use cache for the first page — we can't know if later pages are cached
          const cacheCount = !refresh && offset === 0 ? await CollectionClass.count(search, params) : 0;
          const useCache = cacheCount > 0;
          if (useCache) {
            consoleLog(`[${name}] loadItems local storage (${cacheCount} cached)`);
            items = await CollectionClass.restore(limit, offset, search, params);
          }
          else {
            consoleLog(`[${name}] loadItems supabase fetch (refresh=${refresh}, offset=${offset}, cacheCount=${cacheCount})`);
            items = await CollectionClass.load(limit, offset, search, params);
            if (items) await items.store();
          }
          if (offset > 0) {
            if (items) this.items = [...(this.items ?? []), ...items];
          }
          else {
            this.items = items;
          }
          return Promise.resolve(items);
        }
        catch (error) {
          return Promise.reject(error);
        }
      },
      async loadItem({ id }) {
        try {
          let item = await ModelClass.load(id);
          if (item) {
            await item.store();
          }
          this.item = item;
          return Promise.resolve(item);
        }
        catch (error) {
          return Promise.reject(error);
        }
      },
      async saveItem(data) {
        try {
          let item = await new ModelClass(data).save();
          if (item) {
            await item.store();
          }
          this.item = item;
          this.items = null; // Invalidate list so next loadItems re-fetches from DB
          return Promise.resolve(item);
        }
        catch (error) {
          return Promise.reject(error);
        }
      }
    }
  });
}
