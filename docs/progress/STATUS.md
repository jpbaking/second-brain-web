# STATUS — single source of truth

Updated: 2026-07-11 (active: milestone 36)

## Where we are

- **Everything planned so far is DONE.** The full phase-006 roadmap
  (milestones 0–12: auth, vault clone/health/commit/push, providers, Cline SDK
  chat with tool approvals + write lock, capture/uploads, reports, follow-ups,
  FTS search, link explorer, production hardening) plus the principal-directed
  milestones 13 (compose-helper run path), 14 (app source under `app/`),
  16 (chat-first UI: landing = last active chat, sidebar shell),
  15 (declarative provider provisioning: YAML-only, configure scripts,
  encrypted keys, compose bind-mount), 19–21 (slim Docker, follow-up display,
  dedicated-user deployment).
  Per-milestone checklists with verification evidence:
  `docs/progress/milestones/archive/`. Full narrative: `journal.md`.
- **The app is production-runnable.** Quick start from the repo root:
  `./configure` (writes `.config/{.env,providers.yaml,deploy_key}`) then
  `./compose-helper.sh up`; owner setup via
  `./compose-helper.sh exec second-brain-web node server/dist/cli/reset-auth.js /data`.
  Bare metal: `cd app && npm install && npm run build`, then `npm start` with
  `SECOND_BRAIN_WEB_DATA_DIR` at a private `0700` dir.
- Key facts: all app source lives under `app/` (npm workspace root — run every
  npm command from there). Core DB schema v10; sidecar (`indexes/vault.sqlite`)
  v3. Server test suite: 277 tests, all green. UI routes: `/` = chat (last
  active or new), `/command-centre`, `/capture`, `/follow-ups`, `/reports`,
  `/search`, `/explorer`, `/vault`, `/providers`, `/login`, `/setup`.

## Active milestone

Milestone 36 — Claude Code subscription provider.
Checklist: `docs/progress/milestones/milestone-36-claude-code-provider.md`.
Next: m36-02 Cline SDK model mapping.

## Next step

Complete m36-02. Outstanding unrelated item: PowerShell launcher smoke-test on Windows.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/BACKLOG.md` — the work queue.

## Questions for the principal

- None currently. Manual `claude-auth` will be requested at m36-05 if needed.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
