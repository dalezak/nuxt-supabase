-- ai_usage: append-only log of AI API invocations per user.
-- Each row = one call to an Edge Function that talked to an AI provider
-- (Claude today; OpenAI / Gemini / etc. would slot in alongside via a
-- future `provider` column). Apps use this to enforce per-user rate
-- limits — e.g. "max 10 suggest-habit calls per 24 hours" — by counting
-- recent rows. Forward-compatible with adding `tokens_in` / `tokens_out`
-- / `cost_cents` columns later for cost / billing surfaces.
--
-- The log persists across function invocations (memory-only counters reset
-- on cold start) and survives across edge function deploys.
--
-- Owner-only RLS for reads (users can see their own usage); inserts come
-- from edge functions via service role only.

create table "public"."ai_usage" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "function_name" text not null,
    "created_at" timestamp without time zone default now()
);

create unique index ai_usage_pkey on public.ai_usage using btree (id);
create index ai_usage_user_function_created_idx on public.ai_usage using btree (user_id, function_name, created_at desc);

alter table "public"."ai_usage" add constraint "ai_usage_pkey" primary key using index "ai_usage_pkey";
alter table "public"."ai_usage" add constraint "ai_usage_user_id_fkey" foreign key (user_id) references public.users(id) on delete cascade;

alter table "public"."ai_usage" enable row level security;

create policy "AI usage selectable by owner"
on "public"."ai_usage"
as permissive
for select
to authenticated
using (auth.uid() = user_id);
