#!/usr/bin/env bash
#
# reset-auth.sh — prepare the app data root and (re)initialise owner auth.
#
# Milestone 1 (host bootstrap). Validates SECOND_BRAIN_WEB_DATA_DIR, prepares
# the private runtime layout, then generates fresh owner auth material (a
# one-time password, its Argon2id hash, and a TOTP secret + setup URI).
#
# Run before the first app start:
#
#   SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web ./scripts/reset-auth.sh
#
set -euo pipefail

SBW_SCRIPT_NAME="reset-auth"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/data-root.sh
source "$script_dir/lib/data-root.sh"

sbw_prepare_data_root
data_dir="$SBW_DATA_ROOT"
printf 'reset-auth: data root ready at %s (mode 700).\n' "$data_dir"

# Generate owner auth material via the server CLI. Prefer the built server;
# fall back to tsx for a dev checkout that has not been built yet.
repo_root="$(cd "$script_dir/.." && pwd)"
cli_dist="$repo_root/server/dist/cli/reset-auth.js"
cli_src="$repo_root/server/src/cli/reset-auth.ts"
tsx_bin="$repo_root/node_modules/.bin/tsx"

if [ -f "$cli_dist" ]; then
  node "$cli_dist" "$data_dir"
elif [ -x "$tsx_bin" ]; then
  "$tsx_bin" "$cli_src" "$data_dir"
else
  sbw_die "the server build is missing. Run: npm run build   (then run this script again)."
fi
