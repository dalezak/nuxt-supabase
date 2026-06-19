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
--                 `current_setting('app.supabase_url') || '/functions/v1/' || p_function`
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
        url := current_setting('app.supabase_url') || '/functions/v1/%s',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := '{}'::jsonb
      )$cmd$,
      p_function
    )
  );
end;
$$;
