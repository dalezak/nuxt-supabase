-- Kudos: small acknowledgments one user gives another for a specific activity.
-- Polymorphic via (activity_type, activity_id) so each consuming app picks
-- its own activity types — e.g. 'reflection', 'lesson', 'post'.
--
-- UNIQUE(from_user_id, to_user_id, activity_type, activity_id) makes giving
-- kudos idempotent — a user can only give one kudo per activity per recipient.
--
-- RLS: anyone authenticated can read (kudos are inherently social);
-- only the sender can insert/delete their own kudo.

create table "public"."kudos" (
    "id" uuid not null default gen_random_uuid(),
    "from_user_id" uuid not null,
    "to_user_id" uuid not null,
    "activity_type" text not null,
    "activity_id" uuid not null,
    "created_at" timestamp without time zone default now()
);

create unique index kudos_pkey on public.kudos using btree (id);
create unique index kudos_unique on public.kudos using btree (from_user_id, to_user_id, activity_type, activity_id);
create index kudos_to_user_id_idx on public.kudos using btree (to_user_id);
create index kudos_activity_idx on public.kudos using btree (activity_type, activity_id);

alter table "public"."kudos" add constraint "kudos_pkey" primary key using index "kudos_pkey";
alter table "public"."kudos" add constraint "kudos_unique" unique using index "kudos_unique";
alter table "public"."kudos" add constraint "kudos_from_user_id_fkey" foreign key (from_user_id) references auth.users(id) on delete cascade;
alter table "public"."kudos" add constraint "kudos_to_user_id_fkey" foreign key (to_user_id) references auth.users(id) on delete cascade;

alter table "public"."kudos" enable row level security;

create policy "Kudos readable by all authenticated users"
on "public"."kudos"
as permissive
for select
to authenticated
using (true);

create policy "Kudos insertable by sender"
on "public"."kudos"
as permissive
for insert
to authenticated
with check (auth.uid() = from_user_id);

create policy "Kudos deletable by sender"
on "public"."kudos"
as permissive
for delete
to authenticated
using (auth.uid() = from_user_id);
