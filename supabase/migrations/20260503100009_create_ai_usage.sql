-- ai_usage: append-only log of AI API invocations per user.
-- Each row = one call to an Edge Function that talked to an AI provider
-- (Claude today; OpenAI / Gemini / etc. would slot in alongside via a
-- future `provider` column). Apps use this to enforce per-user rate
-- limits — e.g. "max 10 suggest-habit calls per 24 hours" — by counting
-- recent rows. Forward-compatible with adding `tokens_in` / `tokens_out`
-- / `cost_cents` columns later for cost / billing surfaces.
--
-- Since 2026-09 every row also carries the call's token counts and an
-- estimated USD cost (written by `_shared/ai-usage.ts` → recordAiUsage), plus
-- an optional ref (e.g. ref_type 'course' / 'lesson' + id) so a whole course's
-- spend can be summed across its structure + per-lesson calls. Budget counts
-- that mean "N courses per month" filter on function_name — see
-- enforceMonthlyBudget's functionName argument.
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
    "model" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer,
    "cache_write_tokens" integer,
    "cost_usd" numeric(10, 6),
    "ref_type" text,
    "ref_id" uuid,
    -- timestamptz: enforceMonthlyBudget / enforceDailyCap compare this against
    -- UTC ISO strings, which is only correct for a naive column while the DB
    -- timezone is UTC. An aware column is correct everywhere.
    "created_at" timestamptz default now()
);

create unique index ai_usage_pkey on public.ai_usage using btree (id);
create index ai_usage_user_function_created_idx on public.ai_usage using btree (user_id, function_name, created_at desc);
-- Sum a course's / lesson's spend.
create index ai_usage_ref_idx on public.ai_usage using btree (ref_type, ref_id);

alter table "public"."ai_usage" add constraint "ai_usage_pkey" primary key using index "ai_usage_pkey";
alter table "public"."ai_usage" add constraint "ai_usage_user_id_fkey" foreign key (user_id) references public.users(id) on delete cascade;

alter table "public"."ai_usage" enable row level security;

create policy "AI usage selectable by owner"
on "public"."ai_usage"
as permissive
for select
to authenticated
using (auth.uid() = user_id);
