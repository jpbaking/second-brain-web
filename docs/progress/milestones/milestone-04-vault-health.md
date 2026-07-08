# Milestone 4 — Vault Status And Health

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 4;
`docs/project-plan/phase-003-vault-runtime-and-git.md` (Health Check,
Single-Writer Lock); `docs/project-plan/phase-001-product-and-scope.md` (Daily
Command Center).

Deliverable: the owner can run the vault health check from the UI and lands on a
useful command center after login (git status, health, and available vault
signals).

Binding constraints:
- `scripts/health.py` always exits 0 — inspect its output text, never rely on
  the exit code.
- Run git and python via argv (no shell), in the vault workspace.
- All command-center / health routes are private (behind the m02 auth guard).
- MVP scope: reminders and commitments parsing from `memory/` is not yet
  specified — model those fields as deferred (empty) placeholders; populate the
  concrete signals now (git status, health, lock, inbox backlog, recent
  reports).

- [x] **m04-01** — Git status module: read branch, HEAD commit (hash + subject),
      clean/dirty state, and changed files from the workspace via the git
      runner.
      Verify: `npm test --workspace server -- git-status.test.ts` — a clean temp
      repo reports not dirty with a commit + subject; after an edit it reports
      dirty with the changed file listed.
- [x] **m04-02** — Single-writer lock store: core migration adds a `vault_lock`
      table and a store (acquire when free, heartbeat, release, read current
      with staleness). One active writer at a time.
      Verify: `npm test --workspace server -- vault-lock.test.ts` — acquire
      succeeds when free; a second acquire is refused while held; release frees
      it; a lock past the stale timeout is reported stale/acquirable.
- [x] **m04-03** — Health runner: run `python3 scripts/health.py` in the
      workspace and parse stdout into raw text, an issue count (if detectable),
      sections, and a run timestamp — treating exit 0 as non-authoritative.
      Verify: `npm test --workspace server -- vault-health.test.ts` — a temp
      workspace with a stub `scripts/health.py` yields the parsed issue count
      and sections; a missing script reports a clear not-available result.
- [x] **m04-04** — Health endpoint: guarded `POST /api/vault/health` runs the
      check, stores a last-health summary on the vault config, and returns the
      parsed result.
      Verify: `npm test --workspace server -- vault-health-api.test.ts` — unauth
      401; authed run against a seeded workspace returns the parsed health and
      updates status `lastHealth`.
- [ ] **m04-05** — Command-center data model + guarded `GET /api/command-center`
      aggregating git status, last health, active lock, inbox backlog count, and
      recent reports (reminders/commitments deferred as empty).
      Verify: `npm test --workspace server -- command-center.test.ts` — unauth
      401; authed returns branch/commit/dirty, lock state, inbox count, and
      recent reports for a seeded workspace.
- [ ] **m04-06** — Command center page (`web/`): the post-login landing (`/`)
      shows git status, a health-check button + result, inbox backlog, recent
      reports, and lock state; redirects to `/login` when unauthenticated. The
      setup status page moves to `/setup`.
      Verify: prod build served by Fastify; authenticated headless load of `/`
      shows the command center; 390×844 screenshot; `npm run lint && npm test &&
      npm run build` pass.
- [ ] **m04-07** — Milestone deliverable check: the owner can run the health
      check from the UI and lands on a useful command center after login.
      Verify: end-to-end with a running server against a seeded vault — log in,
      land on the command center, run the health check, and see git + health
      results; full lint/test/build; no secrets or checkouts tracked.
