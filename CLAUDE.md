# nuxt-supabase

A Nuxt 4 + Supabase starter with a model/collection layer, Pinia stores, and IndexedDB-backed local storage.

## Sub-layers — split-outs in progress

This layer is being kept lean and OSS — core data-model primitives only (`SupaModel`, `SupaModels`, `RestModel`, `RestModels`, `users` auth/profile, `useStorage`, `createSupaStore`). Other features split into their own opt-in private sub-layers.

See [README.md](./README.md) for the full inventory. Quick state:

- **Available**: `nuxt-ionic` (OSS), `nuxt-courses`, `nuxt-principles`, `nuxt-notifications`, `nuxt-plans`, `nuxt-friends`, `nuxt-badges`, `nuxt-streaks`, `nuxt-likes` (all private)
- **Possible future split**: `nuxt-ai` — `ai_calls` migration + `_shared/claude.ts` SDK helper. Slightly trickier because `_shared/` is intertwined with other Edge Function helpers.
- **Lean OSS core that stays here**: `users` (auth/profile) + `ai_calls` (rate-limit log) + base classes (`SupaModel`, `SupaModels`, `RestModel`, `RestModels`, `GraphModel`, `GraphModels`, `Model`, `Models`) + `createSupaStore` + `useStorage` + `useAppUser` / `useAuthSession` / `useProfile` composables + universal utils (`console-*`, `is-dev`, `is-prod`, `gravatar-url`, `invokeFunction`, `dayOfYear`, `formatRelative`) + `_shared/edge.ts` Edge Function helper.
- **Stays here**: `users` (auth/profile), `streaks`, `likes`, `ai_calls` — these are the lean core

When working in a consuming app, check the README inventory before writing new infrastructure — it may already exist as a layer.

While a feature is mid-lift, both this layer's old version and the new sub-layer's version may exist in parallel. Lifts land in this order: scaffold new layer → move migrations + models + stores + functions → remove from this layer → update consuming apps' extends + supabase scripts. Don't write new code against features that are mid-lift; reach out for guidance.

## Language

**Use JavaScript, not TypeScript.** All source files under `app/` are `.js`. The only `.ts` files in the Nuxt app are config files (`nuxt.config.ts`, `tsconfig.json`) that Nuxt requires — do not add TypeScript to application code.

**Edge Functions are the exception.** Code under `supabase/functions/` runs on Deno, not in the Nuxt app, and is conventionally written in TypeScript (`index.ts`). The JS-only rule does not apply there.

## Project structure

Nuxt 4 uses `app/` as the source directory. Config files and non-app code stay at the root.

```text
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

## Architectural principles

These rules govern any app that extends this layer.

### Pages use stores, not models

Pages and components must read/write data through Pinia stores, never directly through `SupaModel` / `SupaModels` subclasses. Stores built with `createSupaStore` provide the standard plumbing — load/save/delete, pagination, caching, and local-storage hydration — and can extend it with extra actions.

When a page needs a new data operation, add it as a store action that delegates to a model static — don't reach for the model directly from the component.

### Models leverage base class methods

Models must use the helpers on `SupaModel` / `SupaModels` (`loadModel`, `findModel`, `saveModel`, `deleteModel`, `loadModels`, `countModels`) rather than calling `useSupabaseClient()` directly. If the base classes don't expose what you need, propose adding it to the base — don't reach around them.

**Exception**: dropping to `useSupabaseClient()` is acceptable when the query genuinely requires it — multi-table joins with nested selects, multi-step pipelines, or RPC calls. Keep these as static methods on the model and add a one-line comment explaining why the helper isn't enough (e.g. `// Requires direct Supabase: multi-step join (lesson→module→course) + nested selects`). If the same shape of query shows up twice, that's a signal to add a helper to the base class instead.

### Composables vs stores

- **Stores** — persistent, shared state across pages. Anything backed by Supabase, anything other pages will read.
- **Composables** — encapsulate reusable logic and derived computeds, but don't hold persistent state themselves. They typically call into stores or models.

If a composable starts holding state that other pages need to share, promote it to a store.

### Sensitive logic lives in Supabase Edge Functions

Anything that needs an API key, secret, or service-role credential — third-party API calls, server-only validation, privileged DB writes — must run in a Supabase Edge Function under `supabase/functions/`. The client only has the anon key, so secrets shipped to the browser leak.

Invoke from app code via `invokeFunction(name, payload)` (auto-imported), wrapped in a static method on the relevant model:

```js
// app/models/Course.js
static async generate(topic, level) {
  return invokeFunction('generate', { topic, level });
}
```

Edge function secrets are set via `supabase secrets set KEY=value` — never via `runtimeConfig` or `.env` exposed to the client.

#### Shared Edge Function helpers

The layer ships reusable boilerplate under `supabase/functions/_shared/`. Apps copy these into their own `_shared/` via the `npm run supabase` script (alongside migrations) and import them with relative paths from each function (`../_shared/...`).

- `claude.ts` — `callClaude({ model, system, user, max_tokens, thinking, effort })` returns `{ text, raw, truncated }`. Default model is `claude-opus-4-7`; callers override per task. `parseJSON(text)` strips ```json fences and parses.
- `edge.ts` — `serveEdge(handler)` wraps `Deno.serve` with CORS preflight + try/catch. `verifyAuth(req)` returns `{ ok, user, supabaseAdmin, supabaseUser }` or `{ ok: false, response }` — the latter is a ready-to-return 401. `jsonResponse(data, status)` and `errorResponse(message, status)` build CORS-aware responses.

Apps keep their own prompts and parsing logic in their own `_shared/prompts.ts` (or similar) — the layer only provides the SDK plumbing. Typical edge function shape:

```ts
import { callClaude, parseJSON } from "../_shared/claude.ts";
import { errorResponse, jsonResponse, serveEdge, verifyAuth } from "../_shared/edge.ts";
import { MY_PROMPT } from "../_shared/prompts.ts";

serveEdge(async (req) => {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const { user, supabaseAdmin } = auth;

  const { topic } = await req.json();
  const result = await callClaude({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: MY_PROMPT,
    user: `Topic: ${topic}`,
  });
  if (result.truncated) throw new Error("response truncated");

  const data = parseJSON(result.text);
  // ... persist via supabaseAdmin ...
  return jsonResponse({ ok: true });
});
```

**Edge Functions over Nuxt API routes (`server/api/`)** for the typical Capacitor + Cloudflare stack:

- **Capacitor mobile builds use `nuxt generate` (SSG)** — there's no Nuxt server in the iOS/Android bundle, so `server/api/` routes don't exist on device. Mobile has to call a remote endpoint either way.
- **One endpoint for both clients** — web and mobile hit the same Supabase project. Same `invokeFunction()` call works on every platform.
- **Auth comes free** — the Supabase client forwards the user's JWT automatically; the function can `auth.getUser()` server-side. Hitting Nuxt API routes from mobile means manually attaching the bearer token and re-verifying it per endpoint.
- **Co-located with the DB** — privileged writes happen next to Postgres, fewer hops than mobile → web host → Supabase.
- **Independent deploys** — function bumps don't require rebuilding the mobile app.

`server/api/` is reserved for web-shell-only concerns: SSR endpoints (OG images, server-rendered SEO metadata), webhooks that need to land on the app's domain (Stripe, GitHub), and lightweight proxies the mobile client never calls. Default to Edge Functions.

### Push reusable logic up into this layer

If new code is generic enough to benefit other apps extending `nuxt-supabase`, add it here rather than in the consuming app. Keep app-specific logic in the app; keep cross-app logic upstream.

When uncertain, ask: "Would another app extending this layer want this?" If yes, it belongs in the layer.

## Key conventions

- **Nuxt 4 globals**: Use `import.meta.client` / `import.meta.server` instead of the deprecated `process.client` / `process.server`. Use `import.meta.dev` / `import.meta.prod` instead of `process.env.NODE_ENV` checks.
- **Auto-imports**: Nuxt auto-imports composables (`useStorage`, `useAppUser`, `useAuthSession`, `useProfile`, `useSupabaseClient`, `useSupabaseUser`, `useRuntimeConfig`) and utils (`consoleLog`, `consoleWarn`, `consoleError`, `consoleInfo`, `createSupaStore`, `invokeFunction`, `gravatarUrl`, `isDev`, `isProd`). Do not import these manually in app code.
- **Class imports are explicit**. Models, collections, and base classes (`SupaModel`, `SupaModels`, `RestModel`, `RestModels`, `User`, `Users`) are NOT auto-imported — Nuxt only auto-imports composables and utils. Consuming apps reference layer classes via relative paths (e.g. `import SupaModel from '../../../nuxt-supabase/app/models/SupaModel'`); the consuming app's own models live in `app/models/` and are imported with `~/models/Course`.
- **Model pattern**: Subclass `SupaModel` / `SupaModels` for database-backed models. Override `save()`, `delete()`, and `load()` to delegate to the helpers below. `store()` / `restore()` are opt-in — implement them only when local-storage caching is safe for that data (see "Local storage caching" below).
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

## Model conventions

`SupaModel` subclass — declare every persisted field as a nullable class property, then `super(data)` + `Object.assign(this, data)` in the constructor. The base class reads these properties via `getAttributes()` to know which columns exist:

```js
import SupaModel from './SupaModel';

export default class Course extends SupaModel {

  id = null;
  user_id = null;
  topic = null;
  level = null;
  title = null;
  description = null;
  progress = 0;
  created_at = null;
  updated_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  static async load(id) {
    return this.loadModel(Course, 'courses', { id });
  }

  async save() {
    return this.saveModel(
      Course,
      'courses',
      ['id', 'user_id', 'topic', 'level', 'title', 'description', 'progress'],
      ['id'],
    );
  }
}
```

`SupaModels` subclass — a thin collection wrapper, with static query helpers used by the store:

```js
import SupaModels from './SupaModels';
import Course from './Course';

export default class Courses extends SupaModels {
  constructor(models = []) {
    super(Course, models);
  }

  static async countForUser(userId) {
    return this.countModels('courses', [['user_id', 'eq', userId]]);
  }
}
```

## Local storage caching

`store()` and `restore()` are **opt-in** per model. The base classes provide no-op defaults, so `createSupaStore` automatically uses the cache when a model implements them and goes straight to Supabase when it doesn't:

- `loadItems` checks `Collection.stored(...)` first; if `> 0`, calls `Collection.restore(...)` and skips Supabase. After a fresh Supabase fetch, calls `loaded.store()` to populate the cache.
- `loadItem` / `saveItem` always hit Supabase, then call `.store()` on the result. If the model didn't override `store()`, that call is a no-op.

### When to implement store/restore

Implement them when local caching is safe — the data is mostly immutable, slowly-changing, or owned by the current user, and a few seconds of staleness is acceptable. Examples: course catalogs, lesson content, user profile, completed-lesson history, badge definitions.

Do **not** implement them when realtime accuracy matters. Skipping `store()`/`restore()` forces every read to hit Supabase, which is the right behavior for: live counters and leaderboards, presence/online status, chat messages, notifications, anything other users can edit while this user has the app open, anything the user expects to reflect a server-side write immediately.

When in doubt, leave them off — a fast Supabase round-trip is better than a stale screen the user doesn't trust.

### Pattern when caching is appropriate

Singular model — implement `store()` and the static `restore(id)`:

```js
async store() {
  return this.storeModel(`courses/${this.id}`);
}

static async restore(id) {
  return this.restoreModel(Course, `courses/${id}`);
}
```

Collection — implement static `stored()` (count check) and `restore()` (list query). Both are required for `createSupaStore.loadItems` to use the cache; without `stored()` it always falls through to Supabase:

```js
static async stored(search = '', _params = {}) {
  return this.storedModels('courses/', search, 'title,description');
}

static async restore(limit = 20, offset = 0, search = '', _params = {}) {
  return this.restoreModels(
    Courses, Course, 'courses/', search, offset, limit,
    'created_at:desc', 'title,description',
  );
}
```

Use a key prefix that matches the table name (`courses/${id}`). The trailing fields in `restoreModels` are the haystack columns to search against.

### Nested resources — encode the parent chain in the key

For child resources, embed the parent id(s) in the key so a parent's children can be scanned by prefix without walking the entire namespace. The pattern is `resource/{parentId}/[grandparentId/...]/id`, with the collection's `stored()` / `restore()` using the prefix up to (but not including) the leaf id:

```js
// app/models/Module.js — child of Course
async store() {
  return this.storeModel(`modules/${this.course_id}/${this.id}`);
}
static async restore(course_id, id) {
  return this.restoreModel(Module, `modules/${course_id}/${id}`);
}

// app/models/Modules.js — collection scoped to a course
static async stored(course_id, search = '') {
  return this.storedModels(`modules/${course_id}/`, search, 'title,description');
}
static async restore(course_id, limit = 20, offset = 0, search = '') {
  return this.restoreModels(
    Modules, Module, `modules/${course_id}/`, search, offset, limit,
    'order:asc', 'title,description',
  );
}
```

For deeper hierarchies, append each ancestor in order from outermost to leaf:

```text
courses/{id}
modules/{course_id}/{id}
lessons/{course_id}/{module_id}/{id}
questions/{lesson_id}/{id}
answers/{lesson_id}/{question_id}/{id}
```

Three rules for nested keys:

- **Order ancestors outermost-first.** Loading "all modules in this course" scans `modules/{course_id}/`; loading "all lessons in this module" scans `lessons/{course_id}/{module_id}/`. The prefix you can scan is determined by the order, so the most common parent goes first.
- **Always end the collection prefix with `/`.** `modules/${course_id}/` matches only that course's children; `modules/${course_id}` would also match `modules/${course_id}_2/...` if such a key ever existed.
- **The store passes parent ids through the chain.** Custom store actions that load nested data take parent ids as parameters and forward them to the model — `await Modules.restore(courseId, ...)`, not a parameterless call.

If a child has multiple plausible parents (e.g. a `Like` that could be keyed by `course_id` or `user_id`), pick whichever one is the dominant access pattern — the parent you most often load all children for. Don't try to key by both; pick one and use a separate index/lookup if you need the other direction.

## Store conventions

Stores are built with `createSupaStore(name, ModelClass, CollectionClass, extend = () => ({}))`:

```js
import Course from '~/models/Course';
import Courses from '~/models/Courses';

export const useCoursesStore = createSupaStore('courses', Course, Courses, () => ({
  async countForUser(userId) {
    return Courses.countForUser(userId);
  },
  async loadWithModules(courseId) {
    return Course.loadWithModules(courseId);
  },
}));
```

The `extend` thunk should be thin — each custom action delegates to a static method on the model or collection. Don't put query logic inside the store; put it on the model and call it from here. This keeps stores swappable and models testable.

Stores expose: `item`, `items`, `getItem`, `getItems`, `loadItem`, `loadItems`, `saveItem`, `deleteItem`, `clearItems`, plus whatever the `extend` thunk adds. Use `storeToRefs(store)` in components to keep getters reactive while destructuring actions normally.

## Naming

- **Tables** — single word, lowercase, plural when possible (`courses`, `habits`, `pillars`, `friends`, `groups`). Reach for two words only when no single noun fits the concept; prefer renaming the concept first.
- **Stores** — `kebab-case.js` named after the resource, exporting `useThingsStore` (e.g. `stores/courses.js` → `useCoursesStore`).
- **Models** — `PascalCase.js`, singular for the model (`Course`), plural for the collection (`Courses`). Follows from the table name.
- **Composables** — `useThing.js`, `export function useThing()` returning an object of functions/refs.
- **Utils** — `kebab-case.js`, single default-export function. Auto-imported as camelCase (e.g. `gravatar-url.js` → `gravatarUrl()`).

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

## Badges & awards — moved to `nuxt-badges`

The `badges` + `awards` tables, `Badge` / `Badges` / `Award` / `Awards` models, the idempotent `Badge.award(userId, type)` API, and `useBadgesStore` (with `awardBadge` toast wrapper) all live in [`nuxt-badges`](../nuxt-badges/CLAUDE.md). Apps that need achievement primitives extend that layer.

When both `nuxt-badges` and `nuxt-friends` are included, awards become viewable by friends + group co-members via `nuxt-friends`'s `awards_friend_visibility.sql`.

## Friends, groups, members, kudos, invites

Generic social primitives. Schemas + base models + helper functions live here so consuming apps share one mechanism. Each app composes them with its own domain (e.g. friend-visible reflections, group-shared practices) via app-specific RLS policies.

### Friends / groups / invites / kudos — moved to `nuxt-friends`

The social-graph primitives (friends, groups, members, invites, kudos) plus the `is_friend` / `is_group_member` / `is_group_member_with` SQL helpers, the `invite-send` Edge Function, and all related models + stores live in [`nuxt-friends`](../nuxt-friends/CLAUDE.md). Apps that need a social layer extend that layer.

### Streaks — moved to `nuxt-streaks`

The `streaks` table, `Streak` / `Streaks` models, and `useStreak()` composable all live in [`nuxt-streaks`](../nuxt-streaks/CLAUDE.md). Apps that gamify activity (lesson completion, reflection cadence, etc.) extend that layer.

### Likes — moved to `nuxt-likes`

The `likes` table (polymorphic via `(item_type, item_id)`) and `Like` / `Likes` models live in [`nuxt-likes`](../nuxt-likes/CLAUDE.md). Apps with social-appreciation features extend that layer.

### Push notifications — moved to `nuxt-notifications`

Push subscriptions (per-device endpoints), per-user notification settings (enabled / timezone / quiet hours / prefs jsonb), `is_quiet_hour()` SQL helper, `useNotifications()` composable, and the `notify-send` Edge Function dispatcher all live in [`nuxt-notifications`](../nuxt-notifications/CLAUDE.md). Apps that need push extend that layer.

### Subscriptions (billing) — moved to `nuxt-plans`

The `revenuecat` Edge Function, `usePlan()` composable, and `subscription_status` column convention all live in [`nuxt-plans`](../nuxt-plans/CLAUDE.md). Apps that need paid plans extend that layer.

### Activity formatting (`useActivityFormat`)

Generic dispatch for activity-feed items. Apps declare their own activity-type map; the composable returns icon/color/description formatters that dispatch on `item.type`.

- **`useActivityFormat(typesMap)`**: returns `{ activityIcon, activityColor, activityDescription }`. The `typesMap` shape: `{ [typeKey]: { icon, color, describe(item) } }`. Unknown types fall back to null icon, `'medium'` color, empty description.
- Apps with activity feeds (friends' actions, group activity) use this to keep formatting consistent across feeds — same dispatch shape, app-specific types.

### Date utilities (`dayOfYear`, `formatRelative`)

- **`dayOfYear(date)`**: returns 1..366 (auto-imported util). Used to seed deterministic daily picks (today's principle, today's habit, etc.).
- **`formatRelative(dateStr)`**: returns short relative string (`'just now'`, `'5m ago'`, `'2h ago'`, `'3d ago'`). Returns `''` for falsy input — safe to use directly in templates.

### Where each piece lives

- **Schema + models + DB helper functions**: this layer (`nuxt-supabase`)
- **Composables** (`useStreak`, etc., pure data): this layer (`nuxt-supabase/app/composables/`)
- **Edge Functions** are split across sub-layers: `invite-send` lives in `nuxt-friends`, `notify-send` in `nuxt-notifications`, `revenuecat` in `nuxt-plans`. Apps `cp` the ones they use into their own `supabase/functions/` via `npm run supabase`.
- **App-specific RLS** that grants friend / group visibility on app tables: each consuming app's own migrations (use the `is_friend`, `is_group_member`, `is_group_member_with` functions)
- **App-specific composables** (e.g. friends activity feed wrapping `loadFriendIds` + app-domain queries): each consuming app
- **Each app calls `updateStreak(userId)`** at its own definition of "activity" — the layer doesn't know what triggers it

## Migration workflow

**Pre-production (local development): edit migrations in place.** When iterating on schema during local dev, modify the existing migration file rather than stacking incremental `alter` migrations. Reset the local database (`supabase db reset`) to re-apply from scratch. This keeps the migration history clean while the schema is still in flux and avoids a fossil record of every intermediate shape.

**After deploying to production Supabase: incremental migrations only.** Once a migration has been applied to a hosted database, treat it as immutable. Subsequent schema changes go in new timestamped migration files (`supabase migration new <name>`). Never edit a migration that has run in production — the hosted DB tracks applied migrations by checksum, and a hash mismatch will block future deploys (or worse, leave the schema in an inconsistent state).

The cutover is a one-way door per app: the moment the first deploy touches production, the in-place editing era ends.
