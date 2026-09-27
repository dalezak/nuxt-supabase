-- schedule_edge_function: SQL helper that consuming apps use to register
-- pg_cron jobs that fetch an Edge Function on a fixed cadence. Replaces
-- the ~20-line `do $$ if pg_cron available then cron.schedule(..., format(
-- net.http_post(url := ... + '/functions/v1/<fn>', headers := ..., body :=
-- ...)) end $$` boilerplate with a single one-liner per schedule:
--
--   select public.schedule_edge_function('notify-streak-reminders', '0 19 * * *', 'notify-streak-reminders');
--   select public.schedule_edge_function('notify-dormant-courses', '0 17 * * *', 'notify-dormant-courses');
--   select public.schedule_edge_function('notify-course-reminders', '*/5 * * * *', 'notify-course-reminders');
--
-- Args:
--   p_name      — cron job name (must be unique within `cron.job`)
--   p_cadence   — standard 5-field cron expression
--   p_function  — Edge Function name; the helper builds
--                 `public.app_secret('supabase_url') || '/functions/v1/' || p_function`
--                 with a service-role bearer header
--
-- Local dev (no `pg_cron` available) skips gracefully — same migration
-- runs in both environments without conditional wrapping.
--
-- This migration also installs `pg_cron` + `pg_net` when available so
-- apps don't repeat the extension-creation guard in every schedule
-- migration. Hosted Supabase ships pg_cron + pg_net; local Supabase
-- doesn't (the guard skips).

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  end if;
end;
$$;

-- Config lookup for the two values every scheduled Edge Function call needs:
-- the project URL and a service-role bearer token.
--
-- Reads Supabase Vault first, falling back to an `app.<name>` GUC. Vault is
-- the primary because custom GUCs CANNOT be set on hosted Supabase at all —
-- the `postgres` role isn't a superuser there, so `alter database ... set
-- app.x`, `alter role ... set app.x`, and the in-database variant are all
-- refused, including from the dashboard SQL editor (which runs as the same
-- role). Only local, where `supabase_admin` is reachable, can set them. The
-- GUC fallback exists so databases already configured that way keep working.
--
-- Raises rather than returning null when neither store has the value: the
-- previous behaviour was a bare `current_setting('app.supabase_url')`, whose
-- "unrecognized configuration parameter" error surfaced only in
-- `cron.job_run_details` — every cron on the project failed once a minute,
-- silently, for as long as the setting was missing.
create or replace function public.app_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text;
begin
  -- Dynamic SQL so the function body doesn't hard-depend on the vault schema
  -- existing (it's resolved at call time, not creation time).
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_value using p_name;
  end if;

  if v_value is null or v_value = '' then
    v_value := current_setting('app.' || p_name, true);
  end if;

  if v_value is null or v_value = '' then
    raise exception
      '% is not configured — add a Vault secret named % (see scripts/set-secrets.sh)',
      p_name, p_name;
  end if;

  return v_value;
end;
$$;

-- Writer counterpart, so configuring an environment is one call per value and
-- the create-vs-update branch lives in SQL rather than in a shell script.
-- Vault rejects duplicate names, hence the upsert.
create or replace function public.set_app_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'set_app_secret: Supabase Vault is unavailable in this database';
  end if;

  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'Set by scripts/set-secrets.sh');
  else
    perform vault.update_secret(v_id, p_value, p_name, 'Set by scripts/set-secrets.sh');
  end if;
end;
$$;

create or replace function public.schedule_edge_function(
  p_name text,
  p_cadence text,
  p_function text
) returns void
language plpgsql
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'schedule_edge_function: pg_cron not installed — skipping schedule %', p_name;
    return;
  end if;
  perform cron.schedule(
    p_name,
    p_cadence,
    format(
      $cmd$select net.http_post(
        url := public.app_secret('supabase_url') || '/functions/v1/%s',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.app_secret('supabase_service_role_key')
        ),
        body := '{}'::jsonb
      )$cmd$,
      p_function
    )
  );
end;
$$;

-- ── Lock the secret + scheduling surface down to the server ────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function, PostgREST exposes
-- the public schema, and anon / authenticated are members of PUBLIC — so
-- without this block anyone holding the (public) anon key could call
-- `rpc/app_secret` and read the service-role key, or `set_app_secret` /
-- `schedule_edge_function` to repoint every cron and pg_net call. These
-- functions are only ever invoked from other SECURITY DEFINER SQL (which runs
-- as the definer) and from cron (postgres), neither of which this touches.
revoke all on function public.app_secret(text) from public, anon, authenticated;
revoke all on function public.set_app_secret(text, text) from public, anon, authenticated;
revoke all on function public.schedule_edge_function(text, text, text) from public, anon, authenticated;
