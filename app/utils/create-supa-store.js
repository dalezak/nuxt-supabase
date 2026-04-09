import { defineStore } from 'pinia';

export function createSupaStore(name, ModelClass, CollectionClass, extend = () => ({})) {
  return defineStore(name, () => {
    const item = ref(null);
    const items = ref(null);

    const getItems = computed(() => items.value);
    const getItem = computed(() => (id) => {
      if (items.value?.length > 0 && id) return items.value.find(i => i.id == id);
      return item.value;
    });

    async function loadItems({ limit = 10, offset = 0, search = null, refresh = false, params = {} } = {}) {
      consoleLog(`[${name}] loadItems called (refresh=${refresh}, offset=${offset}, items=${items.value?.length ?? 'null'})`);
      try {
        if (!refresh && offset === 0 && items.value != null && items.value.length <= limit) {
          consoleLog(`${name} loadItems memory cache (${items.value.length} items)`);
          return items.value;
        }
        let loaded = null;
        const storedCount = !refresh && offset === 0 ? await CollectionClass.stored(search, params) : 0;
        if (storedCount > 0) {
          consoleLog(`${name} loadItems local storage (${storedCount} cached)`);
          loaded = await CollectionClass.restore(limit, offset, search, params);
        } else {
          consoleLog(`${name} loadItems supabase fetch (refresh=${refresh}, offset=${offset})`);
          loaded = await CollectionClass.load(limit, offset, search, params);
          if (loaded) await loaded.store();
        }
        if (offset > 0) {
          if (loaded) items.value = [...(items.value ?? []), ...loaded];
        } else {
          items.value = loaded;
        }
        return loaded;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    async function loadItem({ id }) {
      try {
        let loaded = await ModelClass.load(id);
        if (loaded) await loaded.store();
        item.value = loaded;
        return loaded;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    async function saveItem(data) {
      try {
        let saved = await new ModelClass(data).save();
        if (saved) await saved.store();
        item.value = saved;
        items.value = null;
        return saved;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    async function deleteItem(id) {
      try {
        await new ModelClass({ id }).delete();
        if (items.value) items.value = items.value.filter(i => i.id !== id);
        if (item.value?.id === id) item.value = null;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return {
      item,
      items,
      getItems,
      getItem,
      loadItems,
      loadItem,
      saveItem,
      deleteItem,
      ...extend({ item, items }),
    };
  });
}
