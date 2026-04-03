# TODO

## Bugs

- [x] **[SupaModel.js:48]** Fix `for...in` loop in `saveModel` — iterates array indices not values, so `.eq()` conditions use `"0"`, `"1"`... as column names instead of actual key names. Change to `for...of`.
- [x] **[SupaModel.js:81]** Fix `for...in` loop in `deleteModel` — same issue, delete query targets index `"0"` as column name instead of the actual key (e.g. `"id"`). Change to `for...of`.
- [x] **[Users.js:11]** Fix `SupaModels.clearModel(...)` → `SupaModels.clearModels(...)` (plural) — method doesn't exist and will throw at runtime.
- [x] **[SupaModels.js:5]** Fix constructor — calls `super(models)` but `Models` expects `super(modelClass, models)`, breaking constructor-based instantiation e.g. `new Users([item1, item2])`.
- [x] **[SupaModel.js:46]** Fix `this.id.length > 0` check — throws `TypeError` if `id` is ever a number. Replace with `!!this.id`.
- [x] **[User.js:36]** Replace deprecated `Supabase.auth.signIn({ provider })` with `Supabase.auth.signInWithOAuth({ provider: 'google' })` — old API was removed in supabase-js v2.
- [x] **[User.js:132]** Replace `process.env.APP_URL` in `resetPassword` redirect with `useRuntimeConfig().public.url` — `process.env` is not reliably available client-side and the value is already in `runtimeConfig`.
- [x] **[RestModel.js:26, RestModels.js:14]** Remove `initialCache: false` from `useFetch` calls — this option does not exist in Nuxt 4 and is silently ignored.
- [x] **[Models.js:20-33]** Await individual `item.save()` and `item.store()` calls inside `Models.save()` and `Models.store()` — currently fire-and-forget, so errors are silently swallowed and callers cannot know when work is done.

## Security

- [x] **[stores/users.js:99]** Remove password from `consoleLog` in `userLogin` — passwords must never be logged, even in dev mode.
- [x] **[stores/users.js:114]** Remove password from `consoleLog` in `userSignup` — passwords must never be logged, even in dev mode.

## Design

- [x] **[stores/users.js:86]** Fix `googleSignin` — `user.store()` returns `this` or `null`, not the user model; the chained `user = await user.store()` then calls `User.load(user.id)` on the wrong object.
- [x] **[Model.js:64]** `getValues()` silently drops fields with `null` values — prevents explicitly clearing a field to `null` via upsert. Consider including nulls or adding an opt-in parameter.
- [x] **[Model.js:53]** `getAttributes()` unconditionally excludes all `*_at` fields — prevents a subclass from manually setting `updated_at`. Consider making the exclusion list configurable per subclass.
- [x] **[SupaModels.js]** Add `neq` (not-equal) operator to the where clause handler — a very common filter that is absent while less-common operators like `cs`/`cd` are present.
- [x] **[utils/storage.js:188]** Replace deprecated `String.substr()` with `String.slice(1)` in `sortByProperty`.
- [x] **[utils/storage.js:102]** Document that `search()` and `count()` load all keys and items into memory before filtering — fine for small datasets but a known limitation for large ones.

## Quality

- [x] Add unit tests for `Model`, `SupaModel`, and `SupaModels` — there are currently zero tests. At minimum cover `getValues`, `getAttributes`, `loadModels` query building, and `saveModel` insert vs. upsert branching.
