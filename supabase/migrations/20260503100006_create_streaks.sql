-- Streaks: per-user activity streak with current/longest/lifetime tracking
-- and one-day grace. Each consuming app calls `useStreak().updateStreak(userId)`
-- at its own activity moments (lesson completion, reflection, check-in) —
-- the layer maintains the math.
--
-- One row per user (UNIQUE on user_id). Owner-only RLS.
--
-- Columns:
--   current_streak    — consecutive days of activity ending most recently
--   longest_streak    — best current_streak ever achieved
--   lifetime_days     — total distinct days with at least one activity
--                       (the "days of practice" framing — never resets,
--                       always grows; a positive metric independent of streak shame)
--   last_activity_at  — timestamp of most recent activity
--   grace_used        — whether the one-day grace has been spent in the
--                       current streak (resets on consecutive-day continuation)

create table "public"."streaks" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "current_streak" integer not null default 0,
    "longest_streak" integer not null default 0,
    "lifetime_days" integer not null default 0,
    "last_activity_at" timestamp without time zone default now(),
    "grace_used" boolean not null default false,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);

create unique index streaks_pkey on public.streaks using btree (id);
create unique index streaks_user_id_key on public.streaks using btree (user_id);

alter table "public"."streaks" add constraint "streaks_pkey" primary key using index "streaks_pkey";
alter table "public"."streaks" add constraint "streaks_user_id_key" unique using index "streaks_user_id_key";
alter table "public"."streaks" add constraint "streaks_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."streaks" enable row level security;

create policy "Streaks selectable by owner"
on "public"."streaks"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Streaks insertable by owner"
on "public"."streaks"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Streaks updatable by owner"
on "public"."streaks"
as permissive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Friends-can-view policy mirrors what we have on awards (since friends.is_friend exists).
create policy "Streaks viewable by friends"
on "public"."streaks"
as permissive
for select
to authenticated
using (auth.uid() = user_id or is_friend(user_id));
