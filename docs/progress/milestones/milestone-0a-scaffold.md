# Milestone 0A — Scaffold

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 0A.
Binding constraints: `docs/spike/findings.md` m00-10 decisions and the
master plan's hard rules. Stack per master plan: long-lived Node service
(Fastify) + Vite/React front end, TypeScript, SQLite (WAL, FK), lazyway
design kit.

- [x] **m0a-01** — Server skeleton: `server/` TypeScript Fastify app on
      Node 22+ (`engines` set), with `lint`, `format`, `test`, `dev`, and
      `build` scripts wired (eslint/prettier/vitest or equivalents).
      Verify: `npm run lint && npm test && npm run build` all pass on the
      skeleton.
- [x] **m0a-02** — Front end skeleton: `web/` Vite + React + TypeScript,
      dev-proxied to the server; production build served by Fastify static.
      Verify: `npm run dev` serves a page that reaches a `/api/health`
      endpoint on the server.
- [x] **m0a-03** — Design kit: vendor `jpbaking/lazyway-io-design` under
      `web/public/design/`, load `styles.css` then `components.css`
      globally, copy favicons, first screen styled with kit classes only.
      Verify: served HTML links both stylesheets in order and the page uses
      kit component classes (no custom CSS files yet).
- [x] **m0a-04** — Config loader + data root: `SECOND_BRAIN_WEB_DATA_DIR`
      resolved, layout created (`db/`, `logs/`, `sessions/`, …), startup
      fails loudly if the dir is missing/world-readable; bind to localhost
      by default.
      Verify: starting without the env var (or with unsafe perms) exits
      with an actionable error; with it, the layout appears.
- [x] **m0a-05** — SQLite: connection helper (better-sqlite3 or equivalent)
      that sets `journal_mode=WAL` and `foreign_keys=ON` on every
      connection; core DB at `db/app.sqlite`, sidecar at
      `indexes/vault.sqlite`.
      Verify: a test asserts both PRAGMAs on a fresh connection.
- [x] **m0a-06** — Migrations: runner with a schema-version table, startup
      migration + `PRAGMA integrity_check` before serving; core and
      rebuildable tables kept in their separate databases.
      Verify: fresh data dir migrates from zero; rerun is a no-op; a
      corrupted sidecar can be deleted and rebuilt without touching core.
- [x] **m0a-07** — Status page: unauthenticated setup/status screen (the
      only public surface besides login later) showing data-dir state, DB
      state, and "auth not configured — run reset script" messaging, in kit
      styling, readable on phone width.
      Verify: `curl` the status endpoint + view the page at mobile
      viewport; JSON and HTML agree with reality.
- [ ] **m0a-08** — Milestone deliverable check: app starts locally with one
      command, status page reflects missing setup, SQLite WAL/FK/migrations
      in place, first screen uses the kit. Update STATUS, create the
      Milestone 1 (host bootstrap scripts) checklist.
      Verify: fresh clone → `npm install` → documented start command →
      status page works; STATUS points to milestone 01.
