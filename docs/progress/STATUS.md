# STATUS — single source of truth

Updated: 2026-07-11 (milestone 19 activated)

## Where we are

- **Everything planned so far is DONE.** The full phase-006 roadmap
  (milestones 0–12: auth, vault clone/health/commit/push, providers, Cline SDK
  chat with tool approvals + write lock, capture/uploads, reports, follow-ups,
  FTS search, link explorer, production hardening) plus the principal-directed
  milestones 13 (compose-helper run path), 14 (app source under `app/`), and
  16 (chat-first UI: landing = last active chat, sidebar shell).
  Per-milestone checklists with verification evidence:
  `docs/progress/milestones/archive/`. Full narrative: `journal.md`.
- **The app is production-runnable.** Quick start from the repo root:
  `cp .env.example .env` (set `SECOND_BRAIN_WEB_SECRETS_KEY`) then
  `./compose-helper.sh up`; owner setup via
  `docker exec -it <container> node server/dist/cli/reset-auth.js /data`.
  Bare metal: `cd app && npm install && npm run build`, then `npm start` with
  `SECOND_BRAIN_WEB_DATA_DIR` at a private `0700` dir.
- Key facts: all app source lives under `app/` (npm workspace root — run every
  npm command from there). Core DB schema v10; sidecar (`indexes/vault.sqlite`)
  v3. Server test suite: 266 tests, all green. UI routes: `/` = chat (last
  active or new), `/command-centre`, `/capture`, `/follow-ups`, `/reports`,
  `/search`, `/explorer`, `/vault`, `/providers`, `/login`, `/setup`.

## Current phase

**Milestone 19 — slim Docker runtime image is active.** The principal directed
the next recommended backlog item on 2026-07-11. Milestone 15 (YAML-only
provider provisioning) remains designed and gated.

## Next step

- **m19-01:** scope runtime dependencies to the server workspace and measure.
- Checklist: `docs/progress/milestones/milestone-19-slim-docker-image.md`.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/milestones/milestone-19-slim-docker-image.md`.
- `app/Dockerfile`, root/server/web package manifests, and lockfile.
- `docs/deploy/deployment.md` if operator-facing assumptions change.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
