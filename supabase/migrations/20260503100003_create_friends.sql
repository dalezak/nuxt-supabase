-- Friends: bidirectional friendship between two users with a status
-- ('pending' or 'accepted'). UNIQUE(user_id, friend_id) prevents duplicates.
-- The sender (user_id) creates the row; the recipient (friend_id) accepts.
--
-- Renamed from any-learn-co's `friendships` for shorter, single-word naming
-- (matches our convention: pillars, templates, habits, badges, friends).

create table "public"."friends" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "friend_id" uuid not null,
    "status" text not null default 'pending',
    "created_at" timestamp without time zone default now()
);

create unique index friends_pkey on public.friends using btree (id);
create unique index friends_pair_key on public.friends using btree (user_id, friend_id);
create index friends_user_id_idx on public.friends using btree (user_id);
create index friends_friend_id_idx on public.friends using btree (friend_id);

alter table "public"."friends" add constraint "friends_pkey" primary key using index "friends_pkey";
alter table "public"."friends" add constraint "friends_pair_key" unique using index "friends_pair_key";
alter table "public"."friends" add constraint "friends_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;
alter table "public"."friends" add constraint "friends_friend_id_fkey" foreign key (friend_id) references auth.users(id) on delete cascade;
alter table "public"."friends" add constraint "friends_status_check" check (status in ('pending', 'accepted'));
alter table "public"."friends" add constraint "friends_no_self" check (user_id <> friend_id);

alter table "public"."friends" enable row level security;

create policy "Friends rows insertable by sender"
on "public"."friends"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Friends rows readable by sender or recipient"
on "public"."friends"
as permissive
for select
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "Friends rows updatable by recipient (to accept)"
on "public"."friends"
as permissive
for update
to authenticated
using (auth.uid() = friend_id);

create policy "Friends rows deletable by either party"
on "public"."friends"
as permissive
for delete
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

-- Helper: is the given user_id an accepted friend of the current auth user?
-- Used by other tables to widen RLS for friend visibility (e.g. awards).
-- security definer = bypasses RLS on the friends table itself, so the
-- function works regardless of which user is calling.

create or replace function public.is_friend(p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.friends
    where status = 'accepted'
      and (
        (user_id = auth.uid() and friend_id = p_user_id)
        or (friend_id = auth.uid() and user_id = p_user_id)
      )
  )
$$;

-- Layer-table policies that benefit from friend visibility.
-- Apps add their own friend-visibility policies for app-specific tables
-- (BestSelf will add policies on habits for pillar/template "presence" sharing).

create policy "Friends can view awards"
on "public"."awards"
as permissive
for select
to authenticated
using (auth.uid() = user_id or is_friend(user_id));
