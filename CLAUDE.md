# nuxt-supabase

A Nuxt 4 + Supabase starter with a model/collection layer, Pinia stores, and IndexedDB-backed local storage.

## Language

**Use JavaScript, not TypeScript.** All source files under `app/` are `.js`. The only `.ts` files are config files (`nuxt.config.ts`, `tsconfig.json`) that Nuxt requires — do not add TypeScript to application code.

## Project structure

Nuxt 4 uses `app/` as the source directory. Config files and non-app code stay at the root.

```
app/                 Nuxt source directory (srcDir)
  app.vue            Root component
  app.config.ts      App-level runtime config
  models/            Base classes and Supabase-specific subclasses
    Model.js           Base class: getAttributes(), getValues(), storeModel/restoreModel
    Models.js          Base collection (extends Array): save(), store()
    SupaModel.js       Supabase model: loadModel(), findModel(), saveModel(), deleteModel(), insertModel(), upsertModel()
    SupaModels.js      Supabase collection: loadModels(), deleteModels(), countModels()
    RestModel.js       REST model: useFetch-based loadModel/saveModel/deleteModel
    RestModels.js      REST collection: useFetch-based loadModels()
    User.js            Auth + profile model (login, signup, google, resetPassword)
    Users.js           Users collection
  stores/
    users.js           Pinia store: profile, login, signup, google signin, logout
  composables/
    useAppUser.js      Wraps useSupabaseUser()
    useStorage.js      Returns the Storage singleton
  plugins/
    storage.js         Registers Storage singleton as $storage on the Nuxt app
  utils/
    storage.js         Storage class wrapping unstorage (IndexedDB → localStorage fallback)
    console-log.js     consoleLog() — dev-only, prefixed with client/server
    console-warn.js    consoleWarn() — dev-only
    console-error.js   consoleError() — dev-only
    console-info.js    consoleInfo() — dev-only
    is-dev.js          isDev() — returns import.meta.dev
    is-prod.js         isProd() — returns import.meta.prod

nuxt.config.ts       Nuxt config (root)
tests/               Vitest tests (root)
server/              Nuxt server routes (root)
public/              Static assets (root)
supabase/            Supabase migrations/config (root)
```

## Key conventions

- **Nuxt 4 globals**: Use `import.meta.client` / `import.meta.server` instead of the deprecated `process.client` / `process.server`. Use `import.meta.dev` / `import.meta.prod` instead of `process.env.NODE_ENV` checks.
- **Auto-imports**: Nuxt auto-imports composables (`useStorage`, `useAppUser`, `useSupabaseClient`, `useSupabaseUser`, `useRuntimeConfig`) and utils (`consoleLog`, `consoleWarn`, `consoleError`). Do not import these manually in app code.
- **Model pattern**: Subclass `SupaModel` / `SupaModels` for database-backed models. Override `save()`, `delete()`, `store()`, and `load()` to delegate to the helpers below.
- **SupaModel helpers**:
  - `loadModel(modelClass, table, where)` — fetches a single row via `.single()`; PGRST116 (no rows) is silently ignored
  - `findModel(modelClass, table, where)` — like `loadModel` but uses `.maybeSingle()`; prefer this for optional lookups where zero rows is expected
  - `saveModel(modelClass, table, attributes, keys)` — upserts when `this.id` is set, inserts otherwise; returns a fresh hydrated instance
  - `deleteModel(modelClass, table, where)` — deletes rows matching all where conditions; returns true/false
  - `insertModel(table, values)` — static, inserts without returning the row; throws on error
  - `upsertModel(table, values, onConflict)` — static, upserts with explicit conflict columns e.g. `'user_id,question_id'`; throws on error
- **SupaModels helpers**:
  - `loadModels(collectionClass, modelClass, table, { select, limit, offset, where, order })` — paginated query; `where` is `[[column, operator, value], ...]`; supported operators: `eq neq gt lt gte lte ilike like is in cs cd`; `ilike`/`like` auto-wrap value in `%`
  - `deleteModels(table, where)` — bulk delete matching where clauses; throws on error
  - `countModels(table, where)` — returns exact row count matching where clauses; returns 0 on error
- **Collection pattern**: Subclass `SupaModels` with `constructor(modelClass, models)` calling `super(modelClass, models)`. Pass both args through.
- **Runtime config**: Use `useRuntimeConfig().public.url` for the app URL — not `process.env.APP_URL` (unreliable client-side).
- **Local storage**: Use `useStorage()` (or `this.$storage`) — never access `localStorage`/`indexedDB` directly.
- **Logging**: Use `consoleLog` / `consoleWarn` / `consoleError` (dev-only, auto-imported). Never use `console.log` directly. Never log passwords or secrets.

## Testing

- Framework: **Vitest** (`npm test`)
- Test files live in `tests/`
- Setup file `tests/setup.js` stubs `consoleLog`, `consoleWarn`, `consoleError` as no-ops
- Supabase client is mocked via `vi.stubGlobal('useSupabaseClient', ...)` with a chainable builder
- All Nuxt composable globals are stubbed per test file — no Nuxt runtime is needed

## Nuxt / Supabase config

- `nuxt.config.ts`: SSR enabled, Pinia + Supabase modules, `runtimeConfig.public.url` from `APP_URL`
- Supabase redirect is disabled (`redirect: false`); login redirect is `/login`
- Environment variables: `APP_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`
