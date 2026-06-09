import CacheManifest from '../models/CacheManifest';

// Per-table cache invalidation via the `cache_manifest` view. One tiny query
// returns each cacheable table's { updated_at (=max), row_count (=count) }; we
// compare against the fingerprints we stored last time and evict only the
// tables that moved — `updated_at` bump = insert/update, `row_count` drop =
// delete. The local collection cache is keyed `<table>/<id>`, so evicting a
// table is `storage.clear('<table>/')`.
//
// Runs at launch (non-blocking) before the stores populate, so clearing the
// IndexedDB prefix is enough — the in-memory store caches aren't filled yet.

const FINGERPRINT_KEY = 'cache_manifest'; // blob: { _checkedAt, [table]: { updated_at, row_count } }
const TTL_DAYS = 7;
const FETCH_TIMEOUT_MS = 2500;

export function useCacheManifest() {
  const storage = useStorage();
  // App/layer-declared coupling: extra cache prefixes to evict when a given
  // table moves (caches keyed outside the `<table>/` convention, e.g. a
  // denormalized bundle). Deep-merged across layers — see app.config.
  const derivedPrefixes = useAppConfig().cacheManifest?.derivedPrefixes ?? {};

  // Evict a stale table's own `<table>/` prefix plus any derived prefixes it
  // feeds (e.g. `lessons` → `course-modules/`), so bundle caches built from a
  // table stay in lockstep with it without a per-visit freshness check.
  async function evictForTable(table) {
    await storage.clear(`${table}/`);
    // Also drop the matching collection store's IN-MEMORY cache (table name ===
    // store id) so a pre-eviction restore can't keep serving stale data from
    // the memory short-circuit. No-op if that store wasn't instantiated yet.
    resetCacheableStore(table);
    for (const prefix of derivedPrefixes[table] ?? []) {
      consoleLog('cache-manifest', `evicting derived cache: ${prefix} (via ${table})`);
      await storage.clear(prefix);
    }
  }

  async function revalidate() {
    let rows = null;
    try {
      rows = await Promise.race([
        CacheManifest.loadAll(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('cache-manifest timeout')), FETCH_TIMEOUT_MS)),
      ]);
    } catch (_) {
      // Offline / slow / error — can't revalidate; fall back to the TTL cap.
      await ttlBackstop();
      return;
    }

    const storedBlob = await storage.get(FINGERPRINT_KEY);
    // First-ever manifest run: either a fresh install (nothing cached — evicting
    // is a harmless no-op) OR an upgrade from a version that predates this
    // feature, whose caches were written WITHOUT fingerprint tracking and so
    // can't be trusted. Either way, evict every manifest table once on the first
    // run, then refetch under tracking from here on. Runs at launch before any
    // navigation, so no cache written this session is lost.
    const firstRun = !storedBlob;
    const stored = storedBlob ?? {};
    const next = { _checkedAt: new Date().toISOString() };

    for (const row of rows ?? []) {
      const table = row?.table_name;
      if (!table) continue;
      const fp = { updated_at: row.updated_at ?? null, row_count: row.row_count ?? null };
      const prev = stored[table];
      // Evict on the first run (clear any untracked pre-manifest cache) or when
      // a tracked fingerprint moved — `updated_at` bump = insert/update,
      // `row_count` drop = delete.
      //
      // ASSUMPTION (blind spot): the `count + max(updated_at)` fingerprint can
      // miss a HARD-DELETE of a non-newest row that's masked by a same-count
      // insert/edit not raising the max (count nets to 0, max unchanged). Fine
      // for these tables — they're seed-managed reference content (append/edit,
      // hard-deletes rare and seed-time). If a table starts taking concurrent
      // hard-deletes, add a stronger signal to the view (e.g. an id+updated_at
      // hash) instead of count+max.
      if (firstRun || (prev && (prev.updated_at !== fp.updated_at || prev.row_count !== fp.row_count))) {
        consoleLog('cache-manifest', `evicting ${firstRun ? 'pre-manifest' : 'stale'} cache: ${table}`);
        await evictForTable(table);
      }
      next[table] = fp;
    }

    await storage.set(FINGERPRINT_KEY, next);
  }

  // Backstop for the offline case: if the last successful check is older than
  // TTL_DAYS, the caches can't be trusted, so clear them.
  async function ttlBackstop() {
    const stored = await storage.get(FINGERPRINT_KEY);
    if (!stored?._checkedAt) return;
    const ageMs = Date.now() - new Date(stored._checkedAt).getTime();
    if (ageMs <= TTL_DAYS * 24 * 60 * 60 * 1000) return;
    consoleLog('cache-manifest', `TTL backstop: clearing caches (offline > ${TTL_DAYS}d)`);
    for (const table of Object.keys(stored)) {
      if (table === '_checkedAt') continue;
      await evictForTable(table);
    }
    await storage.remove(FINGERPRINT_KEY);
  }

  return { revalidate };
}
