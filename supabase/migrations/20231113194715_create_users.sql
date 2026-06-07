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

create policy "Enable delete for users based on user_id"
on "public"."users"
as permissive
for delete
to authenticated
using ((auth.uid() = id));


create policy "Enable insert for authenticated users only"
on "public"."users"
as permissive
for insert
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."users"
as permissive
for select
to authenticated
using (true);


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





-- Keep `updated_at` current on every row change. Postgres does not do this
-- automatically (the column default fires only on INSERT); moddatetime is the
-- standard Supabase extension that bumps it on UPDATE.
create extension if not exists moddatetime schema extensions;

create trigger users_set_updated_at
    before update on public.users
    for each row execute procedure moddatetime('updated_at');
