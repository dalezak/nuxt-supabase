#!/usr/bin/env bash
#
# Empty the LOCAL Supabase storage volume. Run from a consuming app's directory,
# between `supabase db reset` and the audio restore:
#
#   supabase db reset && ../nuxt-supabase/scripts/clear-local-storage.sh && npm run meditations:restore
#
# ## Why this exists
#
# `supabase db reset` drops `storage.objects` — the METADATA — but leaves the
# FILES in the Docker volume. Nothing ever removes them: the Storage API lists
# from that table, so after a reset it reports an empty bucket while the volume
# still holds every file from every previous cycle. Each reset-and-restore then
# stacks another full copy on top, invisible to the API and unreachable by any
# application-level cleanup.
#
# Unbounded, and it detonates rather than degrading: two apps grew 1.4GB and
# 947MB of actual audio into 23.8GB and 25.5GB of volume, until a reset died
# mid-upload with Postgres 53100 (disk full) and the database wouldn't start at
# all ("could not write init file: No space left on device").
#
# The volume is disposable — `supabase/.audio-cache` on the host is the source of
# truth, and `meditations:restore` re-uploads from it as the very next step.
#
# ## Local only, by construction
#
# It resolves the volume name from THIS app's `supabase/config.toml` project_id
# and touches nothing else. There is no remote equivalent and no flag to make one:
# hosted storage isn't a Docker volume, and a script that could empty a prod
# bucket has no business in a reset chain.

set -euo pipefail

CONFIG="supabase/config.toml"
if [ ! -f "$CONFIG" ]; then
  echo "✗ no $CONFIG — run this from a consuming app's directory" >&2
  exit 1
fi

# project_id = "love-well"  →  love-well
PROJECT="$(sed -n 's/^project_id[[:space:]]*=[[:space:]]*"\(.*\)"/\1/p' "$CONFIG" | head -1)"
if [ -z "$PROJECT" ]; then
  echo "✗ couldn't read project_id from $CONFIG" >&2
  exit 1
fi

VOLUME="supabase_storage_${PROJECT}"

if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  # Nothing to clear is not an error — a fresh machine has no volume yet, and
  # this runs inside a `&&` chain that mustn't break the reset.
  echo "  no storage volume for ${PROJECT} yet — nothing to clear"
  exit 0
fi

BEFORE="$(docker run --rm -v "${VOLUME}:/v" alpine du -sh /v 2>/dev/null | cut -f1 || echo '?')"

# A throwaway container so this works whether or not the stack is up. Deletes
# CONTENTS, not the volume — removing the volume itself would need the storage
# container stopped first, and recreating it races the stack's own startup.
docker run --rm -v "${VOLUME}:/v" alpine sh -c 'rm -rf /v/* /v/.[!.]* 2>/dev/null || true'

echo "  cleared ${VOLUME} (was ${BEFORE}) — meditations:restore will re-upload from the host cache"
