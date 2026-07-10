#!/usr/bin/env bash
#
# generate-deploy-key.sh — create the dedicated SSH deploy key under ssh/.
#
# Milestone 1 (host bootstrap). Validates SECOND_BRAIN_WEB_DATA_DIR, prepares
# the private runtime layout, and generates an ed25519 deploy key the app uses
# to clone/pull the vault over SSH. An existing key is left untouched unless
# --rotate is given, so a deploy key is never silently replaced.
#
#   SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web ./scripts/generate-deploy-key.sh
#   SECOND_BRAIN_WEB_DATA_DIR=/data/second-brain-web ./scripts/generate-deploy-key.sh --rotate
#
set -euo pipefail

SBW_SCRIPT_NAME="generate-deploy-key"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/data-root.sh
source "$script_dir/lib/data-root.sh"

usage() {
  cat <<'USAGE'
usage: generate-deploy-key.sh [--rotate]

Creates the app's SSH deploy key under the data root's ssh/ directory.
  (no flag)   create the key; refuse if one already exists
  --rotate    replace an existing key (invalidates the old one)

Requires SECOND_BRAIN_WEB_DATA_DIR to point at the private data root.
USAGE
}

rotate=false
while [ $# -gt 0 ]; do
  case "$1" in
    --rotate) rotate=true ;;
    -h|--help) usage; exit 0 ;;
    *) sbw_die "unknown argument: $1 (run with --help for usage)" ;;
  esac
  shift
done

sbw_prepare_data_root
data_dir="$SBW_DATA_ROOT"

key_file="$data_dir/ssh/deploy_key"
pub_file="$key_file.pub"

command -v ssh-keygen >/dev/null \
  || sbw_die "ssh-keygen not found on PATH; install OpenSSH and run this script again."

rotated=false
if [ -f "$key_file" ]; then
  if [ "$rotate" != true ]; then
    sbw_die "a deploy key already exists at $key_file. Re-run with --rotate to \
replace it (this invalidates the old key — remove it from your Git host)."
  fi
  # Remove the old pair so ssh-keygen does not prompt to overwrite.
  rm -f "$key_file" "$pub_file"
  rotated=true
fi

# ed25519: modern, compact, and accepted as a deploy key by the major Git hosts.
ssh-keygen -t ed25519 -N '' -C 'second-brain-web deploy key' -f "$key_file" >/dev/null
chmod 600 "$key_file"
chmod 644 "$pub_file"

# Operator instructions. Only the public key is printed — the private key stays
# on the host and is never displayed.
pub_key="$(cat "$pub_file")"
if [ "$rotated" = true ]; then
  printf 'generate-deploy-key: the previous deploy key has been invalidated — remove it from your Git host.\n\n'
fi
cat <<INSTRUCTIONS
generate-deploy-key: created a new SSH deploy key.

  Private key: $key_file (mode 600 — stays on this host, never copy it off)
  Public key:  $pub_file

Add the public key below as a deploy key on your vault's Git host, granting
write access so the app can push vault changes back:

$pub_key

  GitHub:  repository → Settings → Deploy keys → Add deploy key → tick "Allow write access"
  GitLab:  repository → Settings → Repository → Deploy keys → enable "Grant write permissions"
INSTRUCTIONS
