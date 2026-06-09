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

    // Per-collection stale-while-revalidate was removed 2026-06-08 — it had no
    // opt-in callers left (the last, Courses, dropped `static swr` on 06-07) and
    // the cache_manifest now owns launch-time freshness (it checks the same
    // count + max(updated_at) signal and evicts the stale `<table>/` prefix).
    // Re-introduce only for a collection that genuinely changes *within* a
    // session — the manifest only revalidates at launch.

    // `limit` contract: this default (10) OVERRIDES a model's own load()
    // default, because loadItems always forwards `limit` explicitly. A surface
    // that caches a full reference collection (books, quotes, courses, badges)
    // MUST pass an explicit `limit` covering the whole set — otherwise it
    // fetches only 10, store()s them, and next launch stored()→10 makes that
    // slice look like the complete cached catalog. Paginated surfaces pass
    // their page size; full-catalog surfaces pass the cap.
    async function loadItems({ limit = 10, offset = 0, search = null, refresh = false, params = {} } = {}) {
      consoleLog(`[${name}] loadItems called (refresh=${refresh}, offset=${offset}, items=${items.value?.length ?? 'null'})`);
      try {
        // `params` present = a filtered query the generic `<table>/{id}` cache
        // can't represent (it's neither search- nor params-aware). Treat it like
        // `search`: bypass the memory shortcut AND the stored/restore path, load
        // fresh, and don't store() the filtered subset (which would pollute the
        // shared cache and masquerade as the full set on a later unfiltered
        // read). No current collection passes params — this keeps the generic
        // cache safe for the next one that does.
        const hasParams = params != null && Object.keys(params).length > 0;
        // Memory cache. Skipped when searching/filtering — this shortcut isn't
        // search- or params-aware (the stored/restore path below handles
        // search), so honoring it would hand back the previous, differently-
        // filtered set.
        if (!refresh && !search && !hasParams && offset === 0 && items.value != null && items.value.length <= limit) {
          consoleLog(`${name} loadItems memory cache (${items.value.length} items)`);
          return items.value;
        }
        // Single cache scan: restore() returns the cached page directly, so its
        // length IS the hit signal — no separate stored() count pass (that was a
        // second full prefix scan over the same keys per cache hit). restore() is
        // null (base, uncacheable) or empty (cold) → fall through to a DB load +
        // store(). Only at offset 0 / no-refresh / no-params, matching the old
        // cache gate. (Collections keep stored() as a contract helper; loadItems
        // just no longer needs it.)
        const tryCache = !refresh && !hasParams && offset === 0;
        let loaded = tryCache ? await CollectionClass.restore(limit, offset, search, params) : null;
        if (loaded && loaded.length > 0) {
          consoleLog(`${name} loadItems local storage (${loaded.length} cached)`);
        } else {
          consoleLog(`${name} loadItems supabase fetch (refresh=${refresh}, offset=${offset})`);
          loaded = await CollectionClass.load(limit, offset, search, params);
          if (loaded && !hasParams) {
            // (table name === store id === cache prefix `<name>/`.)
            try {
              // On a full refresh (pull-to-refresh, page 0), CLEAR the prefix
              // before re-storing so it's a RECONCILE, not an upsert of the
              // current page: a row deleted server-side otherwise leaves a stale
              // `<name>/<id>` key that a later restore() would resurrect. Deeper
              // pages are never cache-restored (the restore gate is offset === 0),
              // so clearing the stale tail here is harmless.
              if (refresh && offset === 0) await useStorage().clear(`${name}/`);
              await loaded.store();
            } catch (storeError) {
              // A partial cache write (Models.store() throws mid-loop on IDB quota
              // / txn failure) must NOT be left as a trusted partial — a later
              // restore() would serve the incomplete set as the whole catalog.
              // Clear the prefix so the cache is empty (re-fetched next load), and
              // carry on with the freshly-loaded in-memory data so this load still
              // succeeds.
              consoleWarn(`${name} cache store failed — clearing ${name}/ to avoid a trusted partial`, storeError);
              try { await useStorage().clear(`${name}/`); } catch (_) { /* best-effort */ }
            }
          }
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

    // Let the cache_manifest drop this collection's in-memory cache when it
    // evicts the `<name>/` prefix at launch (table name === store id). Without
    // this, a store that restored stale IndexedDB into `items` before the
    // non-blocking manifest pass cleared the prefix would keep serving it from
    // the memory short-circuit. No-op until the manifest actually evicts this
    // table. Client-only — the manifest never runs on the server.
    if (import.meta.client) {
      registerCacheableStore(name, () => { items.value = null; });
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
