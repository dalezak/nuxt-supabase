# nuxt-supabase

A Nuxt 4 + Supabase starter with a model/collection layer, Pinia stores, and IndexedDB-backed local storage.

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

## Badges & awards

Generic achievement primitive. The schema and models live here so consuming apps share one mechanism; each app populates its own badge set via a per-app seed migration.

- **Tables** (created by layer migrations):
  - `badges` — definitions: `(id, type, name, description, icon, created_at)`. `type` is the stable slug for the kind of badge (e.g. `'first_step'`, `'week_warrior'`). Public-readable.
  - `awards` — earned instances: `(id, user_id, badge_id, earned_at)`. UNIQUE(user_id, badge_id) — a badge can only be earned once per user. Owner-only RLS.
- **Models**: `Badge`, `Badges`, `Award`, `Awards` in `app/models/`. Import via relative path (classes aren't auto-imported).
- **Award API**: `Badge.award(userId, type)` is idempotent (upsert). Returns `{ name, description, icon }` only when *just earned* (within 5s window) — null otherwise. Lets callers branch cleanly to celebrate first-time earns without re-toasting.
- **List API**: `Badges.loadForUser(userId)` joins awards → badges, returns `Badge` instances with `earned_at` populated, ordered most-recent first.

**`type` vs `slug`**: `badges.type` is intentionally `type`, not `slug`. Convention: `type` discriminates *kinds* of records (categorical); `slug` is a user-readable id used in URLs. Badges are categorical.

**Per-app seed**: each app writes its own badge inserts in a follow-up migration in *its* `supabase/migrations/` directory. Layer migrations create the tables; app migrations populate them with the badges that make sense for the product.

**Toast wrapper**: the matching `useBadges()` composable lives in `nuxt-ionic` (since toast is a UI concern). Use:

```js
const { awardBadge } = useBadges();
if (count >= 7) await awardBadge(userId, 'week_warrior');
```

App-specific milestone-check functions (which know about the app's domain models) build on top of `awardBadge` — they stay in the consuming app.

## Friends, groups, members, kudos, invites

Generic social primitives. Schemas + base models + helper functions live here so consuming apps share one mechanism. Each app composes them with its own domain (e.g. friend-visible reflections, group-shared practices) via app-specific RLS policies.

### `friends`

Bidirectional friendship between two users with `status` (`'pending'` | `'accepted'`). UNIQUE(user_id, friend_id), CHECK(user_id ≠ friend_id).

- **Model**: `Friend` / `Friends`. API: `sendRequest(fromUserId, toEmail)`, `accept(friendId)`, `remove(friendId)`, `between(userId, otherId)`, `loadForUser(userId)` (returns `{ friends, pending, requests }` with users joined), `loadFriendIds(userId)` (just the accepted friend ids).
- **Helper function**: `is_friend(p_user_id)` — security-definer SQL function. Returns true if the current auth user is an accepted friend of `p_user_id`. Use in RLS policies on app tables to widen visibility for friends.
- **Layer policies provided**: friends-can-view-awards (since `awards` is a layer table). Apps add their own `is_friend(user_id)` policies for app-specific tables (e.g. BestSelf adds friend visibility on `habits.pillar_id` for "presence" sharing).

### `groups` + `members`

Owner-created shared circle (`groups`) + user-belongs-to-group rows (`members`, with `role`).

- **Model**: `Group` / `Groups` (cached locally — slowly-changing), `Member` / `Members`. API: `Member.invite(groupId, userId, role)`, `Member.findUserByEmail(email)`, `Member.loadMemberIdsForUser(userId)` (distinct fellow-member ids across the user's groups), `Members.loadForGroup(groupId)`, `Groups.loadForUser(userId)`.
- **Helper functions**:
  - `is_group_member(p_group_id)` — current user belongs to this group?
  - `is_group_member_with(p_user_id)` — current user shares any group with this user?
- **Layer policies provided**: groups visible to owner OR member; members visible to self OR group owner. Apps add group-visibility on their own tables (e.g. "shared practices visible to fellow group members") via the helper functions.

### `kudos`

Small acknowledgment one user gives another for a specific activity. Polymorphic via `(activity_type, activity_id)` so apps pick their own activity types (`'reflection'`, `'lesson'`, `'post'`, …).

- **Model**: `Kudo` / `Kudos`. API: `Kudo.give(fromUserId, toUserId, activityType, activityId)` (idempotent upsert — UNIQUE on the four key columns), `Kudo.remove(...)`, `Kudo.loadForActivities(items)` (batch-load for activity feeds — items shaped like `{ type, activity_id }`).

### `invites`

Pending invitations to a group (`group_id` set) or a friendship (`group_id` null). When the invitee signs up with the matching email, a DB trigger auto-joins them to the group / auto-accepts the friendship and marks the invite accepted.

- **Model**: `Invite` / `Invites`. API: `Invite.send(groupId, email, groupName, fromName, branding)`, `Invite.sendFriend(userId, email, fromName, branding)`, `Invite.resend(email, fromName, branding)`, `Invite.cancel(inviteId)`, `Invite.loadPendingFriendInvites(userId)`.
- **Trigger**: `process_pending_invites()` fires on insert into `public.users` — auto-joins groups, auto-accepts friend invites, marks invites accepted.
- **Layer Edge Function**: `invite-send` at `supabase/functions/invite-send/`. Validates auth + group ownership, manages the invite/member rows, optionally sends a branded email via Resend. **Apps pass branding parameters** (`app_name`, `app_url`, `from_email`) so the email reflects each app's identity. Set `RESEND_API_KEY` per environment for actual email delivery; the function is best-effort on email and always succeeds at storing the invite (the trigger handles auto-join when the user signs up).

### `streaks`

Per-user activity streak with current/longest/lifetime tracking and one-day grace. One row per user (UNIQUE on `user_id`). Each app calls `useStreak().updateStreak(userId)` at its own activity moments — the layer maintains the math.

- **Columns**: `current_streak`, `longest_streak`, `lifetime_days`, `last_activity_at`, `grace_used`. `lifetime_days` is the "days of practice" metric — total distinct calendar days with activity, never resets, always grows. Lets apps frame progress positively (cumulative pride) alongside the optional streak (consistency).
- **Composable**: `useStreak()` exposes `updateStreak(userId)` and `loadStreak(userId)`.
- **Update logic** (inside `updateStreak`): same-day = no-op; 1-day gap = increment + reset grace; 2-day gap with grace available = increment + spend grace; larger gap = reset to 1. `lifetime_days` increments on any new calendar day.
- **Returns** from `updateStreak`: `{ streak, gap, wasReset, isNew }`. `gap` is days between previous `last_activity_at` and now (0 if same day, null if first activity). `wasReset` is true when the streak dropped to 1. Apps use these for celebration logic (e.g. comeback badges fire when `wasReset || gap >= 3`).
- **Layer policies**: streak rows are owner-only + friend-readable (uses `is_friend()` from the friends migration).
- **Each app defines what activity counts**: BestSelf calls `updateStreak` after a reflection saves; any-learn calls it after a lesson completes. The layer is agnostic.

### `likes`

Polymorphic "user appreciates X" via `(item_type, item_id)`. Each app picks its own item types (`'reflection'`, `'lesson'`, `'post'`).

- **Columns**: `user_id`, `item_type`, `item_id`, `content` (JSONB, optional — for likes carrying data like highlighted text or emoji choice).
- **No UNIQUE on (user_id, item_type, item_id)** — supports both like-once semantics (apps add their own UNIQUE) and multi-like semantics (e.g. multiple highlights per item). Apps choose.
- **Model**: `Like` / `Likes`. API: `Like.insert(userId, itemType, itemId, content)`, `Like.remove(userId, itemType, itemId)`, `Like.removeByContent(...)` (delete distinguished by JSONB content match), `Likes.loadForUserByType(userId, itemType, ...)`.
- **RLS**: owner-only by default. Apps add friend / group visibility via additional policies if needed.

### Push notifications (`subscriptions` + `notification_preferences` + `useNotifications` + `notify-send` Edge Function)

Web push setup. Two tables, two layers of state:

- `subscriptions` is **per-device** — one row per (user, browser/PWA endpoint). A user with both a desktop browser and an installed PWA has two rows.
- `notification_preferences` is **per-user** — opt-in flag, timezone, quiet hours, and a `prefs` jsonb for app-specific extensions (e.g. `{ morningPrompts: true, eveningPrompts: false }`). One row per user.

Components:

- **`subscriptions` table**: `(user_id, endpoint, p256dh, auth)` with UNIQUE(user_id, endpoint). Owner-only RLS.
- **`notification_preferences` table**: `(user_id PK, enabled, timezone, quiet_start, quiet_end, prefs jsonb)`. Owner-only RLS. SQL helper `is_quiet_hour(user_id)` returns whether the current moment falls inside the user's local quiet window (handles timezone + midnight-crossing ranges); apps use it in cron-job recipient filters: `where not is_quiet_hour(user_id)`.
- **`Subscription` model**: `Subscription.upsert(userId, endpoint, p256dh, auth)` (idempotent), `Subscription.deleteForUser(userId, endpoint)`.
- **`NotificationPreference` model**: `NotificationPreference.loadForUser(userId)`, `NotificationPreference.upsert(userId, fields)`.
- **`useNotificationPreferencesStore`**: standard `createSupaStore` wrapper. Use `loadForUser(userId)` / `upsertForUser(userId, fields)` — `loadItem({id})` doesn't apply since the PK is `user_id`.
- **`useNotifications()` composable**: client-side subscription management.
  - `isSupported` (computed) — does the browser support web push?
  - `registerServiceWorker(path = '/sw.js')` — register the SW (apps provide the file)
  - `subscribe(userId)` — request permission, register PushManager, store endpoint via `Subscription.upsert`
  - `unsubscribe(userId)` — remove from PushManager + delete row
  - Reads `runtimeConfig.public.vapidPublicKey` for the application server key.
- **`notify-send` Edge Function** (`supabase/functions/notify-send/`): server-side dispatcher. Auth: Bearer SERVICE_ROLE_KEY. Body: `{ user_ids[], title, body, url? }`. Sends via web-push to all matching subscriptions, returns `{ sent, expired }`. Auto-deletes endpoints that the push service marks as 410 Gone.

Scheduling pattern (apps own this):

1. Enable the `pg_cron` extension in your Supabase project (one click in the dashboard).
2. Write an app-specific Edge Function that picks recipients (joining your domain tables, filtering by `notification_preferences.enabled = true and not is_quiet_hour(user_id)`), builds your app's copy, and POSTs to `notify-send`.
3. Schedule the function with `cron.schedule(...)` SQL — typically every 15–30 minutes, since timezone math means "morning" lands at different UTC times for different users.

Mobile (Capacitor) push is a separate concern — the `useNotifications()` composable handles web push only. Native APNs/FCM via Capacitor Push Notifications plugin layers on top via the `nuxt-ionic` Capacitor wrapper convention.

**Required env vars**: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (Edge Function); `runtimeConfig.public.vapidPublicKey` (client).

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
- **Edge Function `invite-send`**: this layer (`nuxt-supabase/supabase/functions/invite-send/`)
- **App-specific RLS** that grants friend / group visibility on app tables: each consuming app's own migrations (use the `is_friend`, `is_group_member`, `is_group_member_with` functions)
- **App-specific composables** (e.g. friends activity feed wrapping `loadFriendIds` + app-domain queries): each consuming app
- **Each app calls `updateStreak(userId)`** at its own definition of "activity" — the layer doesn't know what triggers it

## Migration workflow

**Pre-production (local development): edit migrations in place.** When iterating on schema during local dev, modify the existing migration file rather than stacking incremental `alter` migrations. Reset the local database (`supabase db reset`) to re-apply from scratch. This keeps the migration history clean while the schema is still in flux and avoids a fossil record of every intermediate shape.

**After deploying to production Supabase: incremental migrations only.** Once a migration has been applied to a hosted database, treat it as immutable. Subsequent schema changes go in new timestamped migration files (`supabase migration new <name>`). Never edit a migration that has run in production — the hosted DB tracks applied migrations by checksum, and a hash mismatch will block future deploys (or worse, leave the schema in an inconsistent state).

The cutover is a one-way door per app: the moment the first deploy touches production, the in-place editing era ends.
