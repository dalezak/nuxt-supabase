-- Notification preferences: per-user opt-in + timezone + quiet-hours +
-- app-specific extensions (jsonb). One row per user.
--
-- Kept separate from `subscriptions` because subscriptions are per-device
-- (a user may have multiple browser/PWA endpoints) while preferences are
-- per-user (cadence, quiet hours, opt-in apply across devices).
--
-- Apps store their own per-prompt-type opt-ins in the `prefs` jsonb column
-- — e.g. `{ "morningPrompts": true, "eveningPrompts": false }` — so the
-- table doesn't need an alter for every new prompt type.

create table "public"."notification_preferences" (
    "user_id" uuid not null,
    "enabled" boolean not null default false,
    "timezone" text,                -- IANA, e.g. 'America/Toronto'
    "quiet_start" time,             -- local time, e.g. '22:00'
    "quiet_end" time,               -- local time, e.g. '07:00'
    "prefs" jsonb not null default '{}'::jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);

create unique index notification_preferences_pkey on public.notification_preferences using btree (user_id);

alter table "public"."notification_preferences" add constraint "notification_preferences_pkey" primary key using index "notification_preferences_pkey";
alter table "public"."notification_preferences" add constraint "notification_preferences_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."notification_preferences" enable row level security;

create policy "Notification preferences selectable by owner"
on "public"."notification_preferences"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Notification preferences insertable by owner"
on "public"."notification_preferences"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Notification preferences updatable by owner"
on "public"."notification_preferences"
as permissive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Notification preferences deletable by owner"
on "public"."notification_preferences"
as permissive
for delete
to authenticated
using (auth.uid() = user_id);

-- Helper: is the given user currently in their configured quiet hours?
-- Returns false if the user has no preferences row, or no quiet window set.
-- Handles ranges that cross midnight (quiet_start > quiet_end), e.g. 22:00–07:00.
-- Apps use this in cron-job recipient filters: `where not is_quiet_hour(user_id)`.
--
-- security definer = bypasses RLS so cron jobs running as service role can
-- check any user's quiet hours; the function reads only timing data, not PII.

create or replace function public.is_quiet_hour(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
declare
  p_tz    text;
  p_start time;
  p_end   time;
  t_local time;
begin
  select timezone, quiet_start, quiet_end
    into p_tz, p_start, p_end
  from public.notification_preferences
  where user_id = p_user_id;

  if p_start is null or p_end is null then
    return false;
  end if;

  t_local := (now() at time zone coalesce(p_tz, 'UTC'))::time;

  if p_start < p_end then
    -- Same-day window, e.g. 13:00–14:00.
    return t_local >= p_start and t_local < p_end;
  else
    -- Crosses midnight, e.g. 22:00–07:00.
    return t_local >= p_start or t_local < p_end;
  end if;
end;
$$;
