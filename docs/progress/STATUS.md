# STATUS — single source of truth

Updated: 2026-07-12 (no active milestone; milestone 48 complete)

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
  npm command from there). Core DB schema v14; sidecar (`indexes/vault.sqlite`)
  v3. Server test suite: 332 tests, all green. UI routes: `/` = chat (last
  active or new), `/command-centre`, `/capture`, `/follow-ups`, `/reports`,
  `/search`, `/explorer`, `/vault`, `/providers`, `/login`, `/setup`.

## Active milestone

Milestone 48 (Web Search Tools — SearXNG) is complete. Archived checklist:
`docs/progress/milestones/archive/milestone-48-web-search.md`. Chat agent now
has auto-approved `web__search` / `web__fetch` MCP tools backed by the new
compose-internal `searxng` service; needs `./compose-helper.sh up` (rebuild)
to go live.

Archived: Milestone 47 (Mermaid Support) is complete. Archived checklist:
`docs/progress/milestones/archive/milestone-47-mermaid-support.md`.

Archived: Milestone 46 (Markdown messages) is complete. Archived checklist:
`docs/progress/milestones/archive/milestone-46-markdown-messages.md`.

## Next step

Await direction.

## Read before working

- `AGENTS-PLAYBOOK.md` — always, top to bottom.
- `docs/progress/BACKLOG.md` — the work queue.

## Questions for the principal

- None currently.

## Known issues / parked TODOs

- Tracked in `docs/progress/BACKLOG.md` (Improvements section) — do not list
  them here twice.
- Live Claude Code routing is verified, but the current Pro allowance returned
  `You've hit your session limit · resets 9:50am (UTC)`; retry after reset.
