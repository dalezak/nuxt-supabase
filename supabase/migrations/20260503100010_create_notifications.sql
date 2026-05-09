-- Notifications: per-user notification settings — opt-in flag, timezone,
-- quiet-hours window, and an app-specific extension jsonb. One row per user.
--
-- Despite the name, this table stores **settings**, not sent-notification
-- records. The name is short for "notification settings"; consuming apps
-- treat it that way.
--
-- Kept separate from `subscriptions` because subscriptions are per-device
-- (a user may have multiple browser/PWA endpoints) while these settings are
-- per-user (cadence, quiet hours, opt-in apply across devices).
--
-- Apps store their own per-prompt-type opt-ins in the `prefs` jsonb column
-- — e.g. `{ "morningPrompts": true, "eveningPrompts": false }` — so the
-- table doesn't need an alter for every new prompt type.

create table "public"."notifications" (
    "user_id" uuid not null,
    "enabled" boolean not null default false,
    "timezone" text,                -- IANA, e.g. 'America/Toronto'
    "quiet_start" time,             -- local time, e.g. '22:00'
    "quiet_end" time,               -- local time, e.g. '07:00'
    "prefs" jsonb not null default '{}'::jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);

create unique index notifications_pkey on public.notifications using btree (user_id);

alter table "public"."notifications" add constraint "notifications_pkey" primary key using index "notifications_pkey";
alter table "public"."notifications" add constraint "notifications_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."notifications" enable row level security;

create policy "Notifications selectable by owner"
on "public"."notifications"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Notifications insertable by owner"
on "public"."notifications"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Notifications updatable by owner"
on "public"."notifications"
as permissive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Notifications deletable by owner"
on "public"."notifications"
as permissive
for delete
to authenticated
using (auth.uid() = user_id);

-- Helper: is the given user currently in their configured quiet hours?
-- Returns false if the user has no settings row, or no quiet window set.
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
  from public.notifications
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
