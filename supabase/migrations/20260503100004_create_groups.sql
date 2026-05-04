-- Groups + Members: shared circles for users to invite each other into.
--
-- `groups` — owner-created circle with a name + description.
-- `members` — user belonging to a group, with a role ('owner' | 'member' | …).
--   (Renamed from any-learn-co's `memberships` for shorter, single-word naming.)
--
-- Helper functions:
--   is_group_member(p_group_id) — does the current auth user belong to this group?
--   is_group_member_with(p_user_id) — does the current auth user share any group with p_user_id?
--
-- App-specific RLS policies that grant group members read access to other
-- tables (e.g. "members can read shared courses") stay in each consuming app's
-- own migrations — this layer only handles the generic primitives.

create table "public"."groups" (
    "id" uuid not null default gen_random_uuid(),
    "owner_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);

create unique index groups_pkey on public.groups using btree (id);
create index groups_owner_id_idx on public.groups using btree (owner_id);

alter table "public"."groups" add constraint "groups_pkey" primary key using index "groups_pkey";
alter table "public"."groups" add constraint "groups_owner_id_fkey" foreign key (owner_id) references auth.users(id) on delete cascade;

alter table "public"."groups" enable row level security;

create policy "Groups insertable by owner"
on "public"."groups"
as permissive
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Groups updatable by owner"
on "public"."groups"
as permissive
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Groups deletable by owner"
on "public"."groups"
as permissive
for delete
to authenticated
using (auth.uid() = owner_id);

create table "public"."members" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null default 'member',
    "joined_at" timestamp without time zone default now()
);

create unique index members_pkey on public.members using btree (id);
create unique index members_group_user_key on public.members using btree (group_id, user_id);
create index members_group_id_idx on public.members using btree (group_id);
create index members_user_id_idx on public.members using btree (user_id);

alter table "public"."members" add constraint "members_pkey" primary key using index "members_pkey";
alter table "public"."members" add constraint "members_group_user_key" unique using index "members_group_user_key";
alter table "public"."members" add constraint "members_group_id_fkey" foreign key (group_id) references public.groups(id) on delete cascade;
alter table "public"."members" add constraint "members_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."members" enable row level security;

-- Helper: is the current auth user a member of the given group?
-- security definer = bypasses RLS recursion when called from policies on members itself.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.members
    where group_id = p_group_id and user_id = auth.uid()
  )
$$;

-- Helper: does the current auth user share any group with p_user_id?
-- Used to widen visibility of one user's data to fellow group members.

create or replace function public.is_group_member_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.members m1
    join public.members m2 on m2.group_id = m1.group_id
    where m1.user_id = auth.uid()
      and m2.user_id = p_user_id
  )
$$;

-- Members policies (now that the helper functions exist)

create policy "Members readable by self or group owner"
on "public"."members"
as permissive
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.groups
    where groups.id = members.group_id and groups.owner_id = auth.uid()
  )
);

create policy "Members insertable by group owner"
on "public"."members"
as permissive
for insert
to authenticated
with check (
  exists (
    select 1 from public.groups
    where groups.id = group_id and groups.owner_id = auth.uid()
  )
);

create policy "Members updatable by group owner"
on "public"."members"
as permissive
for update
to authenticated
using (
  exists (
    select 1 from public.groups
    where groups.id = members.group_id and groups.owner_id = auth.uid()
  )
);

create policy "Members deletable by self or group owner"
on "public"."members"
as permissive
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.groups
    where groups.id = members.group_id and groups.owner_id = auth.uid()
  )
);

-- Now that members exists, broaden groups read policy: owner OR member.

create policy "Groups readable by owner or members"
on "public"."groups"
as permissive
for select
to authenticated
using (auth.uid() = owner_id or is_group_member(id));
