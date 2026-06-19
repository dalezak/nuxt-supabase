-- Auto-create the public.users profile row when a Supabase auth user is created.
--
-- Why: signup used to be two client steps — auth.signUp() then a separate
-- INSERT into public.users (gated by an authenticated-only RLS policy). If the
-- new session wasn't applied to the client yet (cold start / config propagation
-- / a slow first request), that insert was denied and the app reported
-- "Problem Signing Up" even though the AUTH account had been created — a
-- confusing false-negative ("failed", then "already registered" on retry).
--
-- Moving profile creation here makes it server-side + race-proof: SECURITY
-- DEFINER runs the insert as the function owner (full access), the instant the
-- auth row exists, with zero dependence on the client's session or RLS. The app
-- now just calls auth.signUp() and navigates.
--
-- `name` is NOT NULL on public.users — take it from the signUp metadata
-- (raw_user_meta_data->>'name', set by User.signup via options.data.name),
-- falling back to the email local-part so the insert can never fail on a null
-- name. ON CONFLICT DO NOTHING keeps it idempotent (co-exists with any remaining
-- client-side upsert, and is safe to re-run).
--
-- search_path is pinned to '' (hardening for SECURITY DEFINER); every object is
-- schema-qualified. Only base columns (id/email/name) are set — every other
-- public.users column across apps has a default, so the insert always succeeds.

create or replace function public.signup_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(new.email, '@', 1),
      'Friend'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.signup_user();
