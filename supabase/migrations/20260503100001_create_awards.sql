-- Awards: instances of users earning specific badges. UNIQUE(user_id, badge_id)
-- ensures a badge can only be earned once per user (idempotent via upsert).
-- earned_at marks the moment, used for "just earned" celebration logic.

create table "public"."awards" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "badge_id" uuid not null,
    "earned_at" timestamp without time zone default now()
);

create unique index awards_pkey on public.awards using btree (id);
create unique index awards_user_badge_key on public.awards using btree (user_id, badge_id);
create index awards_user_id_idx on public.awards using btree (user_id);

alter table "public"."awards" add constraint "awards_pkey" primary key using index "awards_pkey";
alter table "public"."awards" add constraint "awards_user_badge_key" unique using index "awards_user_badge_key";
alter table "public"."awards" add constraint "awards_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;
alter table "public"."awards" add constraint "awards_badge_id_fkey" foreign key (badge_id) references public.badges(id) on delete cascade;

alter table "public"."awards" enable row level security;

create policy "Awards selectable by owner"
on "public"."awards"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Awards insertable by owner"
on "public"."awards"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);
