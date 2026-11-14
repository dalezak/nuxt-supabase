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

  // Disclosed in the Privacy Policy (nuxt-ionic's useLegal reads every
  // layer's `legal.processors`). Every app on this layer stores its data here.
  legal: {
    processors: {
      supabase: {
        name: 'Supabase',
        purpose: 'hosts the database, sign-in and file storage that hold your account and everything you save.',
        url: 'https://supabase.com/privacy',
      },
    },
  },
})