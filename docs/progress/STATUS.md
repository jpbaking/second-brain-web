# STATUS — single source of truth

Updated: 2026-07-11 (progress files reorganised: history archived, backlog extracted)

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

Backlog-driven. **No milestone is active.** All future work is listed in
`docs/progress/BACKLOG.md` and starts only when the principal says go.
Milestone 15 (YAML-only provider provisioning) is fully designed and gated —
do not start it without an explicit go.

## Next step

- None queued. If the principal names a backlog item: create/activate its
  milestone checklist, point this section at its first item, and run the
  playbook work loop.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/BACKLOG.md` — the work queue.
- The design doc referenced by whichever backlog item is activated
  (e.g. `docs/design/provider-provisioning.md` for milestone 15).
- `docs/project-plan/master-plan.md` — hard rules (secrets, vault guard,
  single-user), if touching auth/providers/vault writes.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
