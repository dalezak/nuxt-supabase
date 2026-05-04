-- Invites: pending invitations to either a group (group_id set) or a
-- friendship (group_id null). When the invitee signs up with the matching
-- email, the trigger auto-joins them to the group / auto-accepts the friend
-- request and marks the invite accepted.
--
-- Two unique constraints (partial indexes) prevent duplicate pending invites:
--   - per-group: one pending invite per (group_id, email)
--   - per-friend: one pending invite per (invited_by, email) when group_id is null

create table "public"."invites" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "email" text not null,
    "invited_by" uuid not null,
    "token" uuid not null default gen_random_uuid(),
    "status" text not null default 'pending',
    "created_at" timestamp without time zone default now()
);

create unique index invites_pkey on public.invites using btree (id);
create unique index invites_group_email_key on public.invites using btree (group_id, email) where group_id is not null;
create unique index invites_friend_email_key on public.invites using btree (invited_by, email) where group_id is null;

alter table "public"."invites" add constraint "invites_pkey" primary key using index "invites_pkey";
alter table "public"."invites" add constraint "invites_group_id_fkey" foreign key (group_id) references public.groups(id) on delete cascade;
alter table "public"."invites" add constraint "invites_invited_by_fkey" foreign key (invited_by) references auth.users(id) on delete cascade;
alter table "public"."invites" add constraint "invites_status_check" check (status in ('pending', 'accepted'));

alter table "public"."invites" enable row level security;

-- Group owner can manage invites for their groups.
create policy "Invites manageable by group owner"
on "public"."invites"
as permissive
for all
to authenticated
using (
  group_id is not null and exists (
    select 1 from public.groups
    where groups.id = invites.group_id and groups.owner_id = auth.uid()
  )
)
with check (
  group_id is not null and exists (
    select 1 from public.groups
    where groups.id = invites.group_id and groups.owner_id = auth.uid()
  )
);

-- User can manage their own friend invites (group_id null).
create policy "Friend invites manageable by sender"
on "public"."invites"
as permissive
for all
to authenticated
using (group_id is null and invited_by = auth.uid())
with check (group_id is null and invited_by = auth.uid());

-- When a new user signs up (row inserted into public.users), auto-process
-- their pending invites: join them to invited groups, auto-accept invited
-- friendships, mark invites as accepted.

create or replace function public.process_pending_invites()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Auto-join groups from group invites
  insert into public.members (group_id, user_id, role)
  select group_id, new.id, 'member'
  from public.invites
  where email = new.email
    and group_id is not null
    and status = 'pending'
  on conflict (group_id, user_id) do nothing;

  -- Auto-accept friend invites by creating an accepted friendship
  insert into public.friends (user_id, friend_id, status)
  select invited_by, new.id, 'accepted'
  from public.invites
  where email = new.email
    and group_id is null
    and status = 'pending'
  on conflict (user_id, friend_id) do nothing;

  -- Mark invites as accepted so they don't reprocess
  update public.invites
  set status = 'accepted'
  where email = new.email and status = 'pending';

  return new;
end;
$$;

create trigger on_user_created_process_invites
after insert on public.users
for each row execute procedure public.process_pending_invites();
