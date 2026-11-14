#!/usr/bin/env bash
# Boot check: send one unauthenticated OPTIONS to every edge function in
# supabase/functions/ and report which ones fail to start.
#
# WHY: Deno rejects a missing named export when the module LOADS, so one bad
# import in a `_shared/*.ts` file takes down every function that imports it.
# The deploy still succeeds; each call then returns 503 with
# `sb-error-code: BOOT_ERROR`. Clients swallow AI failures by design, so it
# shows up as features quietly missing, not as an error. Boot happens before
# auth, so no JWT is needed to catch it.
#
# No CORS preflight headers (Origin / Access-Control-Request-Method): locally
# Kong's cors plugin answers a real preflight itself, 200, without ever
# reaching the function — so a preflight probe passes even with the edge
# runtime stopped. A plain OPTIONS goes through to the function's own handler.
#
# Usage: ../nuxt-supabase/scripts/check-functions.sh [local|dev|prod]   (default: local)
#
#   local    — http://127.0.0.1:54321. If EVERY function fails, the app's edge
#              runtime isn't running: `npm run supabase:functions`.
#   dev/prod — SUPABASE_URL from .env.dev / .env.prod.
#
# 200/204 = boots · 503 BOOT_ERROR = a broken import (the failing set names the
# shared module they have in common) · 404 = not deployed. Exits 1 on any failure.

set -uo pipefail

TARGET="${1:-local}"

read_env() {
  grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | tr -d '"' || true
}

case "$TARGET" in
  local)
    base="http://127.0.0.1:54321"
    ;;
  dev|prod)
    env_file=".env.$TARGET"
    if [ ! -f "$env_file" ]; then
      echo "check-functions: $env_file not found." >&2
      exit 1
    fi
    base="$(read_env "$env_file" SUPABASE_URL)"
    ;;
  *)
    echo "check-functions: unknown target '$TARGET' (local|dev|prod)." >&2
    exit 1
    ;;
esac

if [ -z "$base" ]; then
  echo "check-functions: no SUPABASE_URL for $TARGET." >&2
  exit 1
fi

# Every folder with an entry point. `_shared` and friends have none.
functions=()
for dir in supabase/functions/*/; do
  name="$(basename "$dir")"
  case "$name" in _*) continue ;; esac
  [ -f "$dir/index.ts" ] && functions+=("$name")
done

if [ ${#functions[@]} -eq 0 ]; then
  echo "check-functions: no functions in supabase/functions/ — run from an app root." >&2
  exit 1
fi

probe() {
  local name="$1" response code error
  response="$(curl -s -D - --max-time 60 -X OPTIONS "$base/functions/v1/$name")"
  code="$(printf '%s\n' "$response" | awk 'NR==1 { print $2 }')"
  error="$(printf '%s\n' "$response" | grep -i '^sb-error-code:' | cut -d: -f2- | tr -d ' \r')"
  # Kong's answer when it can't reach the edge runtime at all.
  if [ -z "$error" ] && printf '%s' "$response" | grep -q 'name resolution failed'; then
    error="RUNTIME_DOWN"
  fi
  printf '%s\t%s\t%s\n' "$name" "${code:-000}" "$error"
}
export -f probe
export base

echo "Probing ${#functions[@]} functions on $TARGET ($base)…"
results="$(printf '%s\n' "${functions[@]}" | xargs -P 8 -I{} bash -c 'probe "$@"' _ {} | sort)"

failed=0
while IFS=$'\t' read -r name code error; do
  case "$code" in
    200|204) ;;
    *)
      failed=$((failed + 1))
      printf '  ✗ %-36s %s %s\n' "$name" "$code" "$error"
      ;;
  esac
done <<< "$results"

if [ "$failed" -eq 0 ]; then
  echo "  ✓ all ${#functions[@]} boot"
  exit 0
fi

echo "$failed of ${#functions[@]} failed."
if grep -q 'RUNTIME_DOWN' <<< "$results"; then
  echo "The edge runtime isn't running — start it with: npm run supabase:functions"
fi
exit 1
