-- Likes: polymorphic "user appreciates X" via (item_type, item_id).
-- Each consuming app picks its own item types ('reflection', 'lesson', 'post').
-- `content` is optional JSONB for likes that carry data — e.g. highlighted
-- text within a longer item, an emoji choice, a comment.
--
-- Owner-only RLS by default. Apps can add friend / group visibility with
-- additional policies (using is_friend / is_group_member helpers).
--
-- No UNIQUE constraint on (user_id, item_type, item_id) — supports both
-- like-once semantics (apps add their own UNIQUE) and multi-like-per-item
-- semantics (e.g. multiple highlights). Apps choose.

create table "public"."likes" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "item_type" text not null,
    "item_id" uuid not null,
    "content" jsonb,
    "created_at" timestamp without time zone default now()
);

create unique index likes_pkey on public.likes using btree (id);
create index likes_user_id_idx on public.likes using btree (user_id);
create index likes_item_idx on public.likes using btree (item_type, item_id);

alter table "public"."likes" add constraint "likes_pkey" primary key using index "likes_pkey";
alter table "public"."likes" add constraint "likes_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."likes" enable row level security;

create policy "Likes selectable by owner"
on "public"."likes"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Likes insertable by owner"
on "public"."likes"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Likes deletable by owner"
on "public"."likes"
as permissive
for delete
to authenticated
using (auth.uid() = user_id);
