# STATUS — single source of truth

Updated: 2026-07-11 (milestone 17 complete)

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
  v3. Server test suite: 260 tests, all green. UI routes: `/` = chat (last
  active or new), `/command-centre`, `/capture`, `/follow-ups`, `/reports`,
  `/search`, `/explorer`, `/vault`, `/providers`, `/login`, `/setup`.

## Current phase

Backlog-driven. **No milestone is active.** Milestone 17 encrypted the owner
TOTP secret at rest and safely migrates legacy state. Milestone 15 (YAML-only
provider provisioning) remains fully designed and gated.

## Next step

- None queued. Future work starts only when the principal says go.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/BACKLOG.md` — the work queue.
- The design and project-plan documents relevant to the selected item.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
