# Nuxt Layer Supabase

A lean, OSS Nuxt 4 layer for Supabase apps. Provides core data-model primitives — `SupaModel` / `SupaModels` / `RestModel` / `RestModels` base classes wrapping common Supabase query patterns, plus auth/profile (`users`), local storage (`useStorage`), and the `createSupaStore` Pinia helper. Everything else (friends, badges, subscriptions, notifications, principles, courses) lives in opt-in sub-layers so apps include only what they need.

## Sub-layers

Apps extend `nuxt-supabase` plus whichever sub-layers they need.

### Available

- **[`nuxt-ionic`](https://github.com/dalezak/nuxt-ionic)** *(OSS)* — Ionic Vue + Capacitor + PWA, page conventions, theming, Ionic component library wrappers
- **`nuxt-courses`** *(private)* — Course / Module / Lesson / Question / Answer machinery for learning apps. Lesson-section + question-type render components, paced-learning helpers. Used by any-learn-co, love-well.
- **`nuxt-principles`** *(private)* — `principles` table + 23-principle Stoic/Buddhist seed, `Principle` / `Principles` models with cache + `loadBySlug`, `usePrinciplesStore`. Used by best-self, love-well.
- **`nuxt-notifications`** *(private)* — push `subscriptions` (per-device) + `notifications` settings (per-user) + `is_quiet_hour()` SQL helper + `useNotifications()` composable + `notify-send` Edge Function dispatcher. Used by best-self, any-learn-co.
- **`nuxt-plans`** *(private)* — billing: generic `usePlan()` composable (reads `users.subscription_status` + `useAppConfig().plans`) + `revenuecat` Edge Function webhook handler + convention docs for the `subscription_status` column and `plans` config. Renamed from `nuxt-subscriptions` to avoid name collision with the push `subscriptions` table in `nuxt-notifications`.
- **`nuxt-friends`** *(private)* — social graph: `friends` + `groups` + `members` + `invites` + `kudos` tables, `is_friend()` / `is_group_member()` / `is_group_member_with()` SQL helpers, models + stores, `invite-send` Edge Function, and a cross-table extension migration that re-adds friend/group visibility to `nuxt-supabase`'s `streaks` table when both layers are included.

### In progress — actively being split out from this layer

The features below currently live inside `nuxt-supabase` and are being moved out into their own private sub-layers so the OSS core stays lean and apps can opt in to what they need. Each split is its own commit; expect this section to change in the next several sessions.

- **`nuxt-badges`** — `badges` + `awards` (with `Badge.award(userId, type)` idempotent API). Awards' friend/group visibility RLS depends on `nuxt-friends`'s helpers; cross-app RLS coordination handled per-app post-lift.

### Stays in `nuxt-supabase` (the lean core)

- **`users`** + auth/profile — every app needs auth
- **`streaks`** — comeback-aware streak primitives
- **`likes`** — polymorphic likes/saves
- **`ai_calls`** — AI rate-limit log + `_shared/claude.ts` + `_shared/edge.ts` Edge Function helpers

These may eventually split into their own layers if the layer grows further; for now they stay grouped as the universal kitchen.

### Layer privacy

`nuxt-supabase` and `nuxt-ionic` stay OSS — generic primitives anyone can adopt. The sub-layers above start **private**; some may open-source later once they prove out across apps.

## Packages

Install packages

```bash
npm install
```

Update packages

```bash
npm run update
```

Reinstall packages

```bash
npm run reinstall
```

## Development

Local environment on `http://localhost:3000`

```bash
npm run local -- --open
```

Production environment

```bash
npm run prod -- -open
```

## Production

Production build

```bash
npm run build
```

## Clean

Clean cache

```bash
npm run clean
```

## Supabase

Container start on `http://localhost:54323`

```bash
supabase start
```

Container stop

```bash
supabase stop
```

Database migrate

```bash
supabase db diff --use-migra -f file_name
```

Database reset

```bash
supabase db reset
```

Database seed

```bash
npx snaplet generate --sql > supabase/seed.sql
```

Database push

```bash
supabase db push
```
