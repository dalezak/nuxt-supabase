create table "public"."users" (
    "id" uuid not null,
    "email" character varying not null,
    "name" character varying not null,
    "avatar_url" text,
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



