# `cache_manifest` — cache invalidation for suite apps

**What it is:** a SQL view that returns one row per cacheable reference table — its
`max(updated_at)` and `count(*)`. At launch the client fetches it once and busts only
the local caches whose fingerprint changed. One tiny query gates every cached
collection, instead of N revalidations.

**Why it works:** `updated_at` bumps catch inserts/updates (via the `moddatetime`
triggers); `count(*)` drops catch deletes (the case `max` alone misses). Together
they're a complete change signal.

---

## The flow

```
launch → revalidate() → fetch cache_manifest (≈ one row per cached table)
       → per table: compare {updated_at, row_count} vs stored fingerprint
       → changed? storage.clear('<table>/')   (evict that table's IndexedDB cache)
       → stores then load fresh for evicted tables, cached for the rest
```

Pull-to-refresh stays the manual override. A 7-day TTL backstop covers the offline case
(if the last successful check is too old to trust, caches are cleared).

---

## In the layer already (`nuxt-supabase`) — free for every app

- `cache_manifest` **stub view** — fixes the column contract, empty until an app overrides it.
- `CacheManifest` model — reads the view; never cached (it *is* the freshness oracle).
- `useCacheManifest().revalidate()` — compare fingerprints, evict stale tables, TTL backstop, fetch timeout.
- a `.client` plugin — fires `revalidate()` non-blocking at launch, before stores populate.

## The one thing each app does — override the view

One migration, listing **only** this app's cacheable reference tables:

```sql
create or replace view cache_manifest as
  select 'books'::text as table_name, max(updated_at) as updated_at, count(*) as row_count from public.books
  union all select 'quotes',  max(updated_at), count(*) from public.quotes
  union all select 'courses', max(updated_at), count(*) from public.courses
  -- … your cacheable reference tables
;
```

The app's override migration must have a later timestamp than the layer's stub (it's
vendored in via `npm run supabase`, so this is automatic).

---

## Rules (non-negotiable)

1. **Non-user tables only.** The view runs with definer rights = *global* freshness —
   correct for shared reference content, wrong for per-user data (another user's write
   would falsely bust your cache). Same boundary as caching itself:
   **cacheable ⇔ in the manifest ⇔ global reference content.**
2. **Keep `updated_at` *and* `count(*)`** — drop the count and deletes go undetected.
3. **A table belongs in the view iff it has a local cache to bust** — keep it in sync with
   your `cacheable` models. In-memory-only tables reset each launch, so omit them.
4. **Match the stub's column contract** (`text`, `timestamp`, `bigint`). `create or
   replace view` may only append columns, never change these three.

## Prerequisite

The cacheable tables need the `moddatetime` `updated_at` trigger (run
`add-updated-at-triggers.py` if not already done) — otherwise `max(updated_at)` is frozen
at insert and the manifest never busts.

---

## Worked example (best-self)

```sql
-- best-self/supabase/migrations/…_override_cache_manifest_view.sql
create or replace view cache_manifest as
  select 'books'::text as table_name, max(updated_at) as updated_at, count(*) as row_count from public.books
  union all select 'quotes',  max(updated_at), count(*) from public.quotes
  union all select 'courses', max(updated_at), count(*) from public.courses
  union all select 'lessons', max(updated_at), count(*) from public.lessons
  union all select 'modules', max(updated_at), count(*) from public.modules
;
```

`books` / `quotes` / `courses` are collection caches; `lessons` / `modules` are
per-record caches. `practice_templates` is in-memory-only, so it's intentionally omitted.

Verify after `supabase db reset`:

```sql
select table_name, row_count from public.cache_manifest order by table_name;
-- books|15  courses|14  lessons|252  modules|36  quotes|75
```
