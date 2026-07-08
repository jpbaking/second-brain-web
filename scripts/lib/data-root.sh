# Shared helpers for the host bootstrap scripts. Source this file; do not
# execute it. Callers should set SBW_SCRIPT_NAME before sourcing so error
# messages are attributed to the right script.

# Print an error to stderr and exit non-zero.
# Note: never call this inside a command substitution `$(...)` — the exit would
# only leave the subshell. The helpers below set globals instead, so callers
# invoke them directly (not via `$()`).
sbw_die() {
  printf '%s: %s\n' "${SBW_SCRIPT_NAME:-bootstrap}" "$1" >&2
  exit 1
}

# Validate SECOND_BRAIN_WEB_DATA_DIR, create the data root privately if needed,
# refuse a world/group-reachable root, and create the runtime layout. On
# success sets SBW_DATA_ROOT to the resolved absolute path.
sbw_prepare_data_root() {
  local data_dir="${SECOND_BRAIN_WEB_DATA_DIR:-}"
  if [ -z "$data_dir" ]; then
    sbw_die "SECOND_BRAIN_WEB_DATA_DIR is not set. Point it at a private directory
(e.g. /data/second-brain-web) that will hold auth state, databases, keys, and
the vault checkout, then run this script again."
  fi

  # Canonical runtime layout — keep in sync with DATA_SUBDIRS in
  # server/src/config.ts.
  local subdirs=(auth db secrets ssh workspaces indexes logs sessions)

  # Create the data root privately if it does not exist yet. An existing
  # directory keeps its current mode (checked below).
  mkdir -p -m 700 "$data_dir"

  # Resolve to an absolute path so every message names the real location.
  data_dir="$(cd "$data_dir" && pwd)"

  # Refuse a data root any other user can reach — it holds secrets. Read the
  # permission bits portably (GNU stat, then BSD stat as a fallback).
  local mode
  mode="$(stat -c '%a' "$data_dir" 2>/dev/null || stat -f '%Lp' "$data_dir")"
  if [ $(( 8#$mode & 8#077 )) -ne 0 ]; then
    sbw_die "data directory $data_dir is accessible by other users (mode $mode).
It holds secrets; run: chmod 700 '$data_dir' and run this script again."
  fi

  local sub
  for sub in "${subdirs[@]}"; do
    mkdir -p -m 700 "$data_dir/$sub"
  done

  SBW_DATA_ROOT="$data_dir"
}
