#!/usr/bin/env bash
#
# reset-auth.sh — prepare the app data root and (re)initialise owner auth.
#
# Milestone 1 (host bootstrap). This step validates SECOND_BRAIN_WEB_DATA_DIR,
# creates the private runtime layout, and refuses a data root that other users
# can reach. Owner auth material generation is added in a following step.
#
# Run before the first app start:
#
#   SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web ./scripts/reset-auth.sh
#
set -euo pipefail

die() {
  printf 'reset-auth: %s\n' "$1" >&2
  exit 1
}

data_dir="${SECOND_BRAIN_WEB_DATA_DIR:-}"
if [ -z "$data_dir" ]; then
  die "SECOND_BRAIN_WEB_DATA_DIR is not set. Point it at a private directory
(e.g. /data/second-brain-web) that will hold auth state, databases, keys, and
the vault checkout, then run this script again."
fi

# Canonical runtime layout — keep in sync with DATA_SUBDIRS in
# server/src/config.ts.
subdirs=(auth db secrets ssh workspaces indexes logs sessions)

# Create the data root privately if it does not exist yet. An existing
# directory keeps its current mode (checked below), matching the app's own
# startup behaviour.
mkdir -p -m 700 "$data_dir"

# Resolve to an absolute path so every message names the real location.
data_dir="$(cd "$data_dir" && pwd)"

# Refuse a data root any other user can reach — it holds secrets. Read the
# permission bits portably (GNU stat, then BSD stat as a fallback).
mode="$(stat -c '%a' "$data_dir" 2>/dev/null || stat -f '%Lp' "$data_dir")"
if [ $(( 8#$mode & 8#077 )) -ne 0 ]; then
  die "data directory $data_dir is accessible by other users (mode $mode).
It holds secrets; run: chmod 700 '$data_dir' and run this script again."
fi

# Create the private runtime layout.
for sub in "${subdirs[@]}"; do
  mkdir -p -m 700 "$data_dir/$sub"
done

printf 'reset-auth: data root ready at %s (mode 700, %d subdirectories).\n' \
  "$data_dir" "${#subdirs[@]}"
printf 'reset-auth: owner auth generation runs in the next bootstrap step.\n'
