-- ai_calls: append-only log of Anthropic / AI API invocations per user.
-- Each row = one call to an Edge Function that talked to Claude (or another
-- AI provider). Apps use this to enforce per-user rate limits — e.g. "max
-- 10 suggest-habit calls per 24 hours" — by counting recent rows.
--
-- The log persists across function invocations (memory-only counters reset
-- on cold start) and survives across edge function deploys.
--
-- Owner-only RLS for reads (users can see their own usage); inserts come
-- from edge functions via service role only.

create table "public"."ai_calls" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "function_name" text not null,
    "created_at" timestamp without time zone default now()
);

create unique index ai_calls_pkey on public.ai_calls using btree (id);
create index ai_calls_user_function_created_idx on public.ai_calls using btree (user_id, function_name, created_at desc);

alter table "public"."ai_calls" add constraint "ai_calls_pkey" primary key using index "ai_calls_pkey";
alter table "public"."ai_calls" add constraint "ai_calls_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;

alter table "public"."ai_calls" enable row level security;

create policy "AI calls selectable by owner"
on "public"."ai_calls"
as permissive
for select
to authenticated
using (auth.uid() = user_id);
