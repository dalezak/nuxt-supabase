// Registry linking a cacheable collection store (createSupaStore) to an
// in-memory reset hook, so the cache_manifest can drop that store's memory
// cache when it evicts the table's `<table>/` prefix at launch.
//
// The race this closes: the manifest pass runs non-blocking at launch and
// clears stale IndexedDB prefixes. If a store had already restored the (now
// stale) IndexedDB collection into its `items` ref before that clear landed,
// its loadItems memory short-circuit would keep serving the stale copy until a
// reload / pull-to-refresh. Nulling `items` on eviction forces the next read to
// fall through to the (freshly cleared) storage and re-fetch.
//
// Keyed by table name, which equals the store id for cacheable collections
// (books, quotes, courses, lessons, modules, badges — `createSupaStore(name,…)`
// uses the table name as the store id, and the cache prefix is `<name>/`).
// Client-only: the manifest never runs on the server, and pinia stores are
// per-client singletons so the module-level map is safe here.

const resets = new Map();

// Called once per store (from createSupaStore's setup, on first instantiation).
// Registering every store is harmless — only tables that appear in a
// cache_manifest are ever evicted, so non-cacheable stores' hooks never fire.
export function registerCacheableStore(table, resetFn) {
  if (table && typeof resetFn === 'function') resets.set(table, resetFn);
}

// Called by useCacheManifest().evictForTable when it clears `<table>/`. No-op if
// that store was never instantiated this session (nothing in memory to clear).
export function resetCacheableStore(table) {
  const reset = resets.get(table);
  if (reset) reset();
}
