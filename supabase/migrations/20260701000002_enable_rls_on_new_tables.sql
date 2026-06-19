-- Backstop: auto-enable Row Level Security on every NEW table in `public`.
--
-- Why: RLS is the floor for this stack — anon/authenticated reach the DB
-- directly through PostgREST, so a table without RLS enabled is wide open to
-- whatever the role GRANTs allow. Every table migration is *supposed* to
-- `enable row level security` + add policies, but a single forgotten line ships
-- a silently-exposed table. This event trigger makes "RLS on" the default that
-- you have to actively opt out of, not remember to opt into. (It's the
-- Supabase advisor's "auto-enable RLS for new tables" recommendation.)
--
-- What it does NOT do: it only ENABLES RLS — it does not add any policy. A table
-- with RLS enabled and zero policies denies all rows to anon/authenticated
-- (fail-safe / deny-by-default), while the table owner + service_role still pass
-- through. So a new table that forgets its policies fails CLOSED (locked) rather
-- than OPEN (leaked) — the safe direction. Each migration still adds its own
-- policies right after `create table`; this just guarantees the enable.
--
-- Scope + safety:
--   * `public` schema only — never touches auth/storage/realtime/extensions.
--   * Skips temp tables (their schema is pg_temp_*, not 'public').
--   * Re-enabling RLS on a table that already has it is a no-op, so it's
--     idempotent and harmless alongside an explicit `enable row level security`.
--   * Forward-looking only: event triggers fire on FUTURE DDL, so this does NOT
--     retroactively enable RLS on tables created by earlier migrations. Those
--     are expected to already manage their own RLS. On a fresh `db reset` every
--     table created after this migration's version is covered.
--
-- SECURITY DEFINER + pinned search_path = '' per SECURITY DEFINER hardening
-- conventions; `alter table` is issued against the fully-qualified identity
-- returned by pg_event_trigger_ddl_commands().

create or replace function public.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and schema_name = 'public'
      and object_type = 'table'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists on_create_table_enable_rls;
create event trigger on_create_table_enable_rls
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.enable_rls_on_new_tables();
