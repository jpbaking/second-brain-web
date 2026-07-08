#!/usr/bin/env bash
#
# generate-deploy-key.sh — create the dedicated SSH deploy key under ssh/.
#
# Milestone 1 (host bootstrap). Validates SECOND_BRAIN_WEB_DATA_DIR, prepares
# the private runtime layout, and generates an ed25519 deploy key the app uses
# to clone/pull the vault over SSH. A rotate flag is added in a later step; for
# now an existing key is left untouched.
#
#   SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web ./scripts/generate-deploy-key.sh
#
set -euo pipefail

SBW_SCRIPT_NAME="generate-deploy-key"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/data-root.sh
source "$script_dir/lib/data-root.sh"

sbw_prepare_data_root
data_dir="$SBW_DATA_ROOT"

key_file="$data_dir/ssh/deploy_key"
pub_file="$key_file.pub"

command -v ssh-keygen >/dev/null \
  || sbw_die "ssh-keygen not found on PATH; install OpenSSH and run this script again."

if [ -f "$key_file" ]; then
  # Rotation via a documented flag is added in a later step; refuse to clobber
  # an existing key by default so a deploy key is never silently replaced.
  sbw_die "a deploy key already exists at $key_file — refusing to overwrite it."
fi

# ed25519: modern, compact, and accepted as a deploy key by the major Git hosts.
ssh-keygen -t ed25519 -N '' -C 'second-brain-web deploy key' -f "$key_file" >/dev/null
chmod 600 "$key_file"
chmod 644 "$pub_file"

printf 'generate-deploy-key: created SSH deploy key at %s (private key mode 600).\n' "$key_file"
