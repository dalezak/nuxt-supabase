export default defineAppConfig({
  name: "Supabase",
  description: "Nuxt Layer Supabase",

  // cache_manifest invalidation config. The launch-time revalidate evicts each
  // stale table's own `<table>/` cache prefix. `derivedPrefixes` lets a layer or
  // app declare EXTRA prefixes to evict when a given table moves — for caches
  // keyed outside the `<table>/<id>` convention (e.g. a denormalized bundle).
  // Shape: `{ [tableName]: string[] }`. Deep-merged across layers, so a domain
  // layer can declare its own coupling (see nuxt-courses) and every consuming
  // app inherits it. Default: none.
  cacheManifest: {
    derivedPrefixes: {},
  },
})