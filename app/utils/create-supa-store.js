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
      async loadItems({ limit = 10, offset = 0, search = null } = {}) {
        try {
          let items = await CollectionClass.load(limit, offset, search);
          if (items) {
            await items.store();
          }
          if (offset > 0) {
            if (this.items == null) {
              this.items = [];
            }
            this.items = [...this.items, ...items];
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
          if (this.items == null) {
            this.items = [];
          }
          this.item = item;
          this.items = [...this.items, item];
          return Promise.resolve(item);
        }
        catch (error) {
          return Promise.reject(error);
        }
      }
    }
  });
}
