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

    // Stale-while-revalidate (opt-in). A collection opts in with
    // `static swr = true` + a `static async marker(params)` that returns a
    // cheap freshness token (e.g. `count:maxUpdatedAt`). loadItems then returns
    // the cached list instantly and, in the background, compares the server's
    // marker to the one we stored at cache time — re-fetching + hot-swapping
    // only when it changed. Needs trustworthy `updated_at` (moddatetime
    // triggers). No-op for collections that don't opt in.
    //
    // The marker key lives under its own `_swr/` namespace, NOT under the
    // collection's `${name}/` prefix — otherwise the collection cache's
    // prefix scan (Models.restoreModels / storedModels) would hydrate it as a
    // junk record and inflate the count. It needs no manifest eviction: it's
    // self-maintaining (rewritten on each markFresh / revalidate).
    const swrMarkerKey = () => `_swr/${name}`;

    // Record the current freshness marker after a server load, so the next
    // cold load can tell whether the catalog has moved on.
    async function markFresh(params) {
      try {
        const marker = await CollectionClass.marker(params);
        if (marker != null) await useStorage().set(swrMarkerKey(), marker);
      } catch (error) {
        consoleLog(`${name} SWR markFresh skipped`, error);
      }
    }

    // Background freshness check. Best-effort: any failure leaves the cached
    // list in place (we already returned it).
    async function revalidate(limit, params) {
      try {
        const Storage = useStorage();
        const [serverMarker, cachedMarker] = await Promise.all([
          CollectionClass.marker(params),
          Storage.get(swrMarkerKey()),
        ]);
        if (serverMarker == null) return;
        if (cachedMarker == null) { await Storage.set(swrMarkerKey(), serverMarker); return; }
        if (serverMarker === cachedMarker) return;
        consoleLog(`${name} SWR stale (server=${serverMarker} cached=${cachedMarker}) — revalidating`);
        const reloaded = await CollectionClass.load(limit, 0, null, params);
        if (reloaded) {
          await reloaded.store();
          await Storage.set(swrMarkerKey(), serverMarker);
          items.value = reloaded; // reactive hot-swap — the list updates in place
        }
      } catch (error) {
        consoleLog(`${name} SWR revalidate skipped`, error);
      }
    }

    async function loadItems({ limit = 10, offset = 0, search = null, refresh = false, params = {} } = {}) {
      consoleLog(`[${name}] loadItems called (refresh=${refresh}, offset=${offset}, items=${items.value?.length ?? 'null'})`);
      try {
        // Memory cache. Skipped when searching — this shortcut isn't search-
        // aware (the stored/restore path below is), so honoring it for a search
        // would hand back the previous, unfiltered set.
        if (!refresh && !search && offset === 0 && items.value != null && items.value.length <= limit) {
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
          if (loaded) {
            await loaded.store();
            if (CollectionClass.swr && offset === 0 && !search) await markFresh(params);
          }
        }
        if (offset > 0) {
          if (loaded) items.value = [...(items.value ?? []), ...loaded];
        } else {
          items.value = loaded;
        }
        // We served from cache — kick off a background freshness check. Fire-
        // and-forget so the caller keeps the instant cache; swap happens later
        // if the server moved on. Only on the full first page, never searches.
        if (CollectionClass.swr && storedCount > 0 && offset === 0 && !search) {
          revalidate(limit, params);
        }
        return loaded;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    async function loadItem({ id, refresh = false }) {
      try {
        // Restore-first from local storage for cacheable (reference/content)
        // models — unless refresh:true (pull-to-refresh). Non-cacheable models
        // fall straight through to a fresh DB load, exactly as before.
        if (!refresh && ModelClass.cacheable) {
          const cached = await ModelClass.restore(id);
          if (cached) {
            item.value = cached;
            return cached;
          }
        }
        let loaded = await ModelClass.load(id);
        if (loaded && ModelClass.cacheable) await loaded.store();
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
        const model = new ModelClass({ id });
        await model.delete();
        // Evict from local storage too, else a cached copy resurrects the row
        // on the next restore() (after an app restart, when memory is cold).
        // store() removes the entry when deleted_at is set — see Model.storeModel.
        model.deleted_at = new Date().toISOString();
        await model.store();
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
