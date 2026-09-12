#!/usr/bin/env bash
# Configure the two values every scheduled Edge Function call needs: the
# project URL and a service-role bearer token.
#
# Both are stored as Supabase Vault secrets (`supabase_url`,
# `supabase_service_role_key`) and read back by `public.app_secret()`, which
# `schedule_edge_function`'s cron command and `enqueue_enrich_course` call.
#
# Vault rather than `alter database ... set app.x`: custom GUCs cannot be set
# on hosted Supabase at all. The `postgres` role isn't a superuser there, so
# every form is refused — including from the dashboard SQL editor, which runs
# as the same role. Only local can set them, so a GUC-based design silently
# fails EVERY cron on dev and prod, once per tick, into cron.job_run_details.
#
# Usage: ./scripts/set-secrets.sh [local|dev|prod]   (default: local)
#
#   local    — reads the port + service_role JWT from `supabase status`.
#              Re-run after `supabase db reset`: Vault secrets are rows in
#              the database, so a reset drops them.
#   dev/prod — reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
#              SUPABASE_DB_URL from .env.dev / .env.prod (all gitignored).
#
# Idempotent — `set_app_secret` upserts, so re-running is always safe.

set -euo pipefail

TARGET="${1:-local}"

# Read KEY=value from a dotenv file without sourcing it (values may contain
# characters that would otherwise be interpreted by the shell).
read_env() {
  grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | tr -d '"' || true
}

case "$TARGET" in
  local)
    status="$(supabase status -o env 2>/dev/null || true)"
    if [ -z "$status" ]; then
      echo "set-secrets: local stack isn't running — run 'npm run supabase:start' first." >&2
      exit 1
    fi
    # pg_net dials out from inside the Postgres container, so localhost would
    # be the container itself. Docker Desktop maps host.docker.internal.
    api_port="$(printf '%s\n' "$status" | grep '^API_URL=' | sed 's/.*://; s/"//g')"
    api_url="http://host.docker.internal:${api_port}"
    # The legacy service_role JWT, NOT the sb_secret_* key in .env: the edge
    # runtime's verify_jwt rejects the new key format with
    # 401 UNAUTHORIZED_INVALID_JWT_FORMAT.
    service_key="$(printf '%s\n' "$status" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')"
    db_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    ;;
  dev|prod)
    env_file=".env.$TARGET"
    if [ ! -f "$env_file" ]; then
      echo "set-secrets: $env_file not found." >&2
      exit 1
    fi
    api_url="$(read_env "$env_file" SUPABASE_URL)"
    db_url="$(read_env "$env_file" SUPABASE_DB_URL)"
    # Which key pg_net must send is decided by what the PLATFORM injects into
    # the Edge Function's SUPABASE_SERVICE_ROLE_KEY, because verifyServiceRole
    # byte-compares the bearer token against it. Projects on the new API key
    # system get the `sb_secret_*` key there, so sending a legacy JWT passes the
    # gateway and is then rejected 401 {"error":"Unauthorized"} by our own code.
    # Older projects still get the JWT.
    #
    # So: prefer an sb_secret_* value wherever it's defined, and fall back to a
    # JWT. SUPABASE_CRON_KEY is the explicit override for apps whose
    # SUPABASE_SECRET_KEY already holds a legacy JWT that other tooling depends
    # on — set it to the sb_secret_* key without disturbing the existing entry.
    service_key=""
    for candidate_var in SUPABASE_CRON_KEY SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY; do
      candidate="$(read_env "$env_file" "$candidate_var")"
      case "$candidate" in
        sb_secret_*) service_key="$candidate"; break ;;
        eyJ*) [ -z "$service_key" ] && service_key="$candidate" ;;
      esac
    done
    if [ -z "$service_key" ] || [ -z "$db_url" ]; then
      echo "set-secrets: $env_file needs two entries this script can't derive:" >&2
      echo "  SUPABASE_SECRET_KEY=<sb_secret_… key, Settings -> API Keys>" >&2
      echo "  SUPABASE_DB_URL=<Settings -> Database -> Connection string (with password)>" >&2
      echo "Both are secrets; $env_file is gitignored." >&2
      exit 1
    fi
    # A Postgres connection string, not the project API URL — pasting the
    # latter makes psql read it as a bare database name and fail obscurely.
    case "$db_url" in
      postgresql://*|postgres://*) ;;
      *)
        echo "set-secrets: SUPABASE_DB_URL in $env_file isn't a Postgres connection string." >&2
        echo "Expected postgresql://postgres.<ref>:<password>@<host>:5432/postgres" >&2
        echo "(Settings -> Database -> Connection string -> URI), got: ${db_url%%:*}..." >&2
        exit 1
        ;;
    esac
    # Hosted accepts either key format at the gateway; what matters is matching
    # what the function sees. Guard against a publishable/anon key landing here.
    case "$service_key" in
      sb_secret_*|eyJ*) ;;
      *)
        echo "set-secrets: the key must be a secret key (sb_secret_…) or legacy" >&2
        echo "service_role JWT (eyJ…), from Settings -> API Keys." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "set-secrets: unknown target '$TARGET' (expected local, dev, or prod)." >&2
    exit 1
    ;;
esac

if [ -z "$api_url" ] || [ -z "$service_key" ]; then
  echo "set-secrets: couldn't resolve the Supabase URL or service_role key for '$TARGET'." >&2
  exit 1
fi

# Double any single quotes before inlining into SQL literals.
esc_url="${api_url//\'/\'\'}"
esc_key="${service_key//\'/\'\'}"

psql "$db_url" -v ON_ERROR_STOP=1 -tAq -o /dev/null \
  -c "select public.set_app_secret('supabase_url', '${esc_url}')" \
  -c "select public.set_app_secret('supabase_service_role_key', '${esc_key}')"

# Read back through the same path the crons use, so a success here means the
# crons can resolve their config too.
psql "$db_url" -tAq -c \
  "select 'set-secrets: ' || public.app_secret('supabase_url')
        || ' (service_role key set: '
        || (public.app_secret('supabase_service_role_key') is not null) || ')'"
