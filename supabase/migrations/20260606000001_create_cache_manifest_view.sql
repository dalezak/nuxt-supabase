-- Cache-freshness manifest — one row per cacheable REFERENCE table:
--   table_name | updated_at (= max(updated_at)) | row_count (= count(*))
--
-- The client fetches this once at launch and compares each row against its
-- stored fingerprint to bust stale local caches:
--   updated_at bumps  -> an insert or update happened (moddatetime trigger)
--   row_count drops   -> a delete happened (the case max alone misses)
-- One tiny round-trip gates every cached collection, instead of N revalidations.
--
-- Runs with DEFINER rights (security_invoker off, the default) so it reports
-- GLOBAL freshness — correct for shared reference content, and the reason this
-- must ONLY ever list non-user-specific tables (a user-scoped table's global
-- max/count is the wrong signal, and that data shouldn't be cached anyway).
--
-- This is a STUB that fixes the column contract; each app overrides it with
--   create or replace view cache_manifest as <union of its cacheable tables>
-- (the override may only append columns, never change these three). An app that
-- doesn't override just gets an empty manifest and falls back to the TTL backstop.

create view cache_manifest as
  select null::text      as table_name,
         null::timestamp  as updated_at,
         null::bigint     as row_count
  where false;

grant select on cache_manifest to authenticated, anon;
