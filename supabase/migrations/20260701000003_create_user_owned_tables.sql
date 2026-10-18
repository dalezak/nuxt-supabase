-- `public.user_owned_tables()` — every base table in `public` that carries a
-- `user_id` column, read from the catalog at call time.
--
-- Used by the account-data export (`_shared/account-data.ts`): "everything we
-- store about you" is, by convention across these layers, every row whose
-- `user_id` is yours. A hand-kept list of those tables drifts — love-well's
-- once named a table that no longer existed and missed the six most personal
-- ones, and a bad name doesn't fail an export, it lands as `{ error }` under
-- that key, so nobody notices. Reading the catalog means a table a layer or app
-- adds later is exported the day it ships, with nothing to remember.
--
-- Tables keyed some other way (`users` on `id`, a two-sided table like
-- `pairings`) are passed to the export explicitly by the app.
--
-- Service role only: it returns table NAMES, not rows, but nothing on the
-- client needs it, so nothing on the client gets it.

create or replace function public.user_owned_tables()
returns setof text
language sql
stable
set search_path = ''
as $$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and a.attname = 'user_id'
    and a.attnum > 0
    and not a.attisdropped
  order by 1;
$$;

revoke all on function public.user_owned_tables() from public;
revoke all on function public.user_owned_tables() from anon, authenticated;
grant execute on function public.user_owned_tables() to service_role;
