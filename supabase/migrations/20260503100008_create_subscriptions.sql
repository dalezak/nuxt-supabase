-- Subscriptions: web push subscription endpoints registered per user.
-- One row per (user_id, endpoint) — a user can have multiple devices/browsers.
-- p256dh + auth are the encryption keys returned by PushManager.subscribe().
--
-- Used by the layer's `useNotifications()` composable (subscribe/unsubscribe
-- on the client) and the layer's `notify-send` Edge Function (server-side
-- dispatch via web-push).
--
-- Owner-only RLS — a user can only see / manage their own push endpoints.
-- The notify-send Edge Function uses the service role to read across users.

create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "endpoint" text not null,
    "p256dh" text not null,
    "auth" text not null,
    "created_at" timestamp without time zone default now()
);

create unique index subscriptions_pkey on public.subscriptions using btree (id);
create unique index subscriptions_user_endpoint_key on public.subscriptions using btree (user_id, endpoint);
create index subscriptions_user_id_idx on public.subscriptions using btree (user_id);

alter table "public"."subscriptions" add constraint "subscriptions_pkey" primary key using index "subscriptions_pkey";
alter table "public"."subscriptions" add constraint "subscriptions_user_endpoint_key" unique using index "subscriptions_user_endpoint_key";
alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."subscriptions" enable row level security;

create policy "Subscriptions selectable by owner"
on "public"."subscriptions"
as permissive
for select
to authenticated
using (auth.uid() = user_id);

create policy "Subscriptions insertable by owner"
on "public"."subscriptions"
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Subscriptions deletable by owner"
on "public"."subscriptions"
as permissive
for delete
to authenticated
using (auth.uid() = user_id);
