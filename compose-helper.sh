#!/bin/bash

# Github: https://github.com/jpbaking/compose-helper
# Author: jpbaking (https://github.com/jpbaking)
#
# Thin wrapper around docker compose that enforces consistent project naming,
# env file handling, and provides shorthand commands for common workflows.
# Must live alongside docker-compose.yaml. Safe to call via symlink.
#
# WARNING: Intended for local development use only. Do not use in production
# or CI/CD pipelines without careful review — commands like 'down' remove
# volumes, env files are sourced and exported into the process, and there is
# no access control or dry-run mode.

# Resolve through symlinks so the working directory is always the script's
# real location, not where the symlink lives or where the caller is.
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
SCRIPT_NAME="$(basename "$SCRIPT_PATH")"
SCRIPT_BASE="${SCRIPT_NAME%.*}"

cd "$SCRIPT_DIR"

# Prefer the v2 plugin ("docker compose") over the standalone v1 binary.
# DC is an array so it expands safely regardless of whether it's one or two words.
if docker compose version &>/dev/null 2>&1; then
    DC=(docker compose)
elif command -v docker-compose &>/dev/null 2>&1; then
    DC=(docker-compose)
else
    echo "Error: neither 'docker compose' nor 'docker-compose' found" >&2
    exit 1
fi

if [[ -f "docker-compose.yaml" ]]; then
    COMPOSE_FILE="docker-compose.yaml"
elif [[ -f "docker-compose.yml" ]]; then
    COMPOSE_FILE="docker-compose.yml"
else
    echo "Error: no docker-compose.yaml or docker-compose.yml found in $SCRIPT_DIR" >&2
    exit 1
fi

# (script_name).env configures DCH itself (timeouts, tail length, etc.).
# Sourced early so DCH_PROJECT_NAME can override the directory-derived project name.
# set -a exports every variable so child processes (docker compose) see them too.
# Note: if DCH_* vars are already in the calling shell's environment, sourcing
# this file will overwrite them — the file takes precedence over the caller.
if [[ -f "${SCRIPT_BASE}.env" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${SCRIPT_BASE}.env"
    set +a
fi

# DCH_PROJECT_NAME (from compose-helper.env) overrides the directory-derived name.
# Pinning the project name prevents docker compose from deriving it from the
# current working directory, which can vary by caller.
PROJECT_NAME="${DCH_PROJECT_NAME:-$(basename "$SCRIPT_DIR")}"
DC_OPTS=(-p "$PROJECT_NAME" -f "$COMPOSE_FILE")

# .env is passed to docker compose for container variable substitution.
# .config/.env is the fallback for projects that keep config out of the root.
if [[ -f ".env" ]]; then
    DC_OPTS+=(--env-file ".env")
elif [[ -f ".config/.env" ]]; then
    DC_OPTS+=(--env-file ".config/.env")
fi

DCH_STOP_TIMEOUT="${DCH_STOP_TIMEOUT:-30}"
DCH_LOGS_TAIL="${DCH_LOGS_TAIL:-10}"

run_dc() {
    "${DC[@]}" "${DC_OPTS[@]}" "$@"
}

usage() {
    cat <<EOF
Usage: $(basename "$0") <command> [args]

Commands:
  up       Rebuild, start detached, then follow logs
  rebuild  Rebuild, start detached
  build    Rebuild only (no start)
  pull     Pull images
  start    Start detached (no pull/build)
  restart  Stop then start detached (no pull/build)
  stop     Stop with ${DCH_STOP_TIMEOUT}s timeout, remove orphans
  down     Stop with ${DCH_STOP_TIMEOUT}s timeout, remove orphans and volumes
  logs     Follow logs from last ${DCH_LOGS_TAIL} lines
  <other>  Pass-through to docker compose

Note: passing 2 or more arguments always bypasses named commands and routes
directly to docker compose (e.g. 'up --build' skips the 'up' shorthand).

Environment (set in ${SCRIPT_BASE}.env):
  DCH_PROJECT_NAME  Override project name (default: directory name)
  DCH_STOP_TIMEOUT  Shutdown timeout in seconds (default: 30)
  DCH_LOGS_TAIL     Log tail line count (default: 10)

Project: $PROJECT_NAME  Compose: $COMPOSE_FILE
EOF
}

if [[ $# -gt 1 ]]; then
    run_dc "$@"
    exit
fi

case "${1:-}" in
    ""|--help)
        usage
        ;;
    up)
        # --profile build targets services with a build: block, which by convention
        # are always placed under the "build" profile in docker-compose.yaml.
        # --pull ensures base images are refreshed, not served from the layer cache.
        run_dc --profile build build --pull
        run_dc up -d
        run_dc logs -f --tail="$DCH_LOGS_TAIL"
        ;;
    start)
        run_dc up -d
        ;;
    pull)
        run_dc pull
        ;;
    build)
        run_dc --profile build build --pull
        ;;
    rebuild)
        run_dc --profile build build --pull
        run_dc up -d
        ;;
    restart)
        run_dc down -t "$DCH_STOP_TIMEOUT" --remove-orphans
        run_dc up -d
        ;;
    stop)
        run_dc down -t "$DCH_STOP_TIMEOUT" --remove-orphans
        ;;
    down)
        # -v removes named volumes — use when a clean-slate data reset is intended.
        run_dc down -t "$DCH_STOP_TIMEOUT" --remove-orphans -v
        ;;
    logs)
        run_dc logs -f --tail="$DCH_LOGS_TAIL"
        ;;
    *)
        run_dc "$@"
        ;;
esac
