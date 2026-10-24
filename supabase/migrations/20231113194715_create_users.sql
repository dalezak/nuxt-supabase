create table "public"."users" (
    "id" uuid not null,
    "email" character varying not null,
    "name" character varying not null,
    "avatar_url" text,
    "onboarded_at" timestamp without time zone,
    -- Per-user settings blob (account-scoped, synced across devices). Each
    -- app declares its own toggles in app.config `settings`; this stores
    -- whatever keys they set (dark_mode, push_*, etc.). Patched one key at a
    -- time via set_user_setting() so concurrent toggles don't clobber.
    "settings" jsonb not null default '{}',
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
);


alter table "public"."users" enable row level security;

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

-- Cascade auth-side deletes through public.users so child tables that FK to
-- public.users(id) (results, awards, likes, enrollments, friends, etc.) also
-- get cleaned up when a Supabase auth user is deleted. Child tables FK to
-- public.users (not auth.users) so PostgREST can resolve the relationship
-- and serve `users(name, email, avatar_url)` joins.
alter table "public"."users" add constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) on delete cascade;

-- Rows are created by the `signup_user` trigger (security definer). This
-- policy exists only because `User.save()` upserts, and an upsert is checked
-- against INSERT: it is your own row or nothing. No delete policy — deleting
-- an account goes through the `delete-user-account` edge function (service
-- role). A self-delete let a client drop its row and re-insert it with
-- whatever subscription columns it liked, past a guard that only saw UPDATEs.
create policy "Users insert own row"
on "public"."users"
as permissive
for insert
to authenticated
with check ((auth.uid() = id));


-- Your own row only. Every user's email, settings and plan used to be
-- readable by anyone signed in. Layers that genuinely link two people add
-- their own permissive SELECT policy here (nuxt-pairings: your pairing's
-- other side; nuxt-friends: friends and group co-members); finding someone
-- by an address you typed goes through `users_by_email` below.
create policy "Users read own row"
on "public"."users"
as permissive
for select
to authenticated
using ((auth.uid() = id));


create policy "Enable update for users based on user_id"
on "public"."users"
as permissive
for update
to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));


-- Atomically patch ONE setting key for the calling user. `settings ||
-- {key:value}` merges a single key rather than overwriting the whole blob,
-- so two settings toggled in quick succession can't clobber each other.
-- security invoker (default) + `where id = auth.uid()` means a caller can
-- only ever write their own row, gated by the update policy above.
create or replace function public.set_user_setting(p_key text, p_value jsonb)
returns void
language sql
as $$
  update public.users
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(p_key, p_value),
      updated_at = now()
  where id = auth.uid();
$$;

grant execute on function public.set_user_setting(text, jsonb) to authenticated;


-- Exact-address lookup for "connect with someone you know" flows (friend
-- requests, group and course invites, find-my-friends), now that `users` is
-- no longer readable across accounts. Only addresses the caller already has,
-- matched exactly, at most 50 per call; returns id + name, never more of the
-- row. It does reveal whether an address has an account, which every invite
-- flow needs to choose between "connect" and "invite".
create or replace function public.users_by_email(p_emails text[])
returns table (id uuid, name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.name::text, u.email::text
  from public.users u
  where auth.uid() is not null
    and lower(u.email) = any (
      select lower(trim(e)) from unnest(p_emails[1:50]) as e
    );
$$;

revoke all on function public.users_by_email(text[]) from public, anon;
grant execute on function public.users_by_email(text[]) to authenticated;





-- Keep `updated_at` current on every row change. Postgres does not do this
-- automatically (the column default fires only on INSERT); moddatetime is the
-- standard Supabase extension that bumps it on UPDATE.
create extension if not exists moddatetime schema extensions;

create trigger users_set_updated_at
    before update on public.users
    for each row execute procedure extensions.moddatetime('updated_at');


-- `email` follows the login, not the client. Invite flows find people by it
-- (`send-pairing-invite`, `users_by_email`, pending-invite matching at
-- signup), so a client that could write it could set its row to someone
-- else's address — and receive the invites meant for them, or block that
-- person's signup on the unique index. A write from a client (anon /
-- authenticated JWT) gets the address from its own token; the signup
-- trigger and the service role are untouched.
create or replace function public.pin_user_email()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  if claims ->> 'role' in ('anon', 'authenticated') then
    new.email := coalesce(
      nullif(lower(claims ->> 'email'), ''),
      case when tg_op = 'UPDATE' then old.email end,
      new.email
    );
  end if;
  return new;
end;
$$;

create trigger users_pin_email
    before insert or update on public.users
    for each row execute function public.pin_user_email();
