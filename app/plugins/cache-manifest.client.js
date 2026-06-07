// Revalidate local caches once at launch via the cache_manifest view. Fired
// non-blocking: the tiny manifest query typically resolves before the user
// navigates to a cached surface (so they see fresh data), and offline it fails
// fast — never delaying startup. Stale tables are evicted so their next read
// refetches; pull-to-refresh remains the manual override.
export default defineNuxtPlugin(() => {
  useCacheManifest().revalidate();
});
