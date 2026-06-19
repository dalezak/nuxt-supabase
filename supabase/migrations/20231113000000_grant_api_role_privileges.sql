-- Base table/sequence privileges for the API roles: anon + authenticated
-- (PostgREST/client) and service_role (edge functions via the service key).
-- Runs FIRST so it shapes everything created afterward.
--
-- Why this is needed: `supabase db reset` runs migrations as the `postgres`
-- role, and in the local stack the `postgres` role's DEFAULT PRIVILEGES for
-- these roles grant only the non-DML bits (TRUNCATE/REFERENCES/TRIGGER/
-- MAINTAIN) — NOT SELECT/INSERT/UPDATE/DELETE. (supabase_admin's defaults do
-- grant DML, but migrations don't run as supabase_admin.) The result: every
-- table a later migration creates is unreadable/unwritable —
-- "permission denied for table …", SQLSTATE 42501 — for both logged-in users
-- AND edge functions (which use service_role; that's why ask-coach failed with
-- "Could not open today's conversation"). These table-level grants are what
-- RLS sits on top of; RLS still governs which ROWS each user can touch
-- (service_role bypasses RLS but still needs the table grant).
--
-- Security posture (hosted-safe): anon (UNAUTHENTICATED) is READ-ONLY — SELECT
-- only, never INSERT/UPDATE/DELETE — so a missing or loose RLS policy can never
-- expose anonymous writes on a hosted project. authenticated + service_role get
-- full DML. Public-readable tables still rely on their own RLS SELECT policies;
-- this grant is the floor RLS sits on, not the gate. (Apps needing a specific
-- anon read add their own narrower grant — e.g. the courses public-read
-- migrations.)
--
-- The ALTER DEFAULT PRIVILEGES lines are the real fix: they extend the
-- postgres role's defaults so every table/sequence created by subsequent
-- migrations is granted automatically. The GRANT … ON ALL lines cover anything
-- that already exists (a no-op on a fresh reset where this runs first).
-- Idempotent and safe to re-run.

grant usage on schema public to anon, authenticated, service_role;

-- anon: read-only.  authenticated + service_role: full DML.
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
