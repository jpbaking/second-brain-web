# Milestone 44: General-purpose agent container toolkit

## Tasks

- [ ] m44-01: Expand the runtime image with common filesystem, archive, text, build, database, process, network, and scripting tools; expose Debian's `fdfind` as `fd`; enforce availability with a build-time smoke check.
  - Verify: `./compose-helper.sh rebuild` and `docker compose exec -T second-brain-web sh -lc 'for c in find fd rg tree jq yq git ssh curl wget tar gzip bzip2 xz zip unzip file diff patch make gcc g++ python3 pip3 sqlite3 rsync ps pgrep ping nc; do command -v "$c" >/dev/null || exit 1; done'`
