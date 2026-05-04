-- Badges: definitions of achievements consuming apps can award to users.
-- Schema lives in this layer; seed data is per-app (each consuming app
-- inserts its own set of badges via a follow-up migration).
--
-- Public-readable so any user can see badge definitions even before earning.

create table "public"."badges" (
    "id" uuid not null default gen_random_uuid(),
    "type" text not null,
    "name" text not null,
    "description" text,
    "icon" text,
    "created_at" timestamp without time zone default now()
);

create unique index badges_pkey on public.badges using btree (id);
create unique index badges_type_key on public.badges using btree (type);

alter table "public"."badges" add constraint "badges_pkey" primary key using index "badges_pkey";
alter table "public"."badges" add constraint "badges_type_key" unique using index "badges_type_key";

alter table "public"."badges" enable row level security;

create policy "Badges readable by all authenticated users"
on "public"."badges"
as permissive
for select
to authenticated
using (true);
