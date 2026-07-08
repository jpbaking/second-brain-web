# Milestone 3 — Vault Configuration And Clone

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 3,
and `docs/project-plan/phase-003-vault-runtime-and-git.md` (Vault
Configuration, Clone Flow, Runtime Layout).

Deliverable: the owner can configure a repo and clone it into the data root;
the UI shows the branch and commit.

Binding constraints:
- Vault config lives in core SQLite (MVP: one vault, id `default`). Never send
  the SSH private key (or its contents) to the browser.
- Run git with an explicit `GIT_SSH_COMMAND` using the deploy key and
  `IdentitiesOnly=yes`; pass argv directly (no shell string interpolation).
- The checkout lives under the data root at `workspaces/second-brain/`; the
  deploy key is `ssh/deploy_key` (created by m01-03 — the plan's
  `second_brain_ed25519` name is illustrative; use the real path).
- Never run a destructive `git reset`/clean automatically; refuse a workspace
  whose remote does not match the configured one.
- All vault routes are private (behind the m02 auth guard).

- [x] **m03-01** — Core-DB migration adds a `vault_config` table (single
      `default` row: display name, remote URL, branch, workspace path, ssh key
      path, last commit, last pull timestamp, last health result) and a config
      module (read with sensible defaults, upsert).
      Verify: `npm test --workspace server -- vault-config.test.ts` — a fresh DB
      yields defaults (branch `main`; workspace + ssh paths derived from the
      data root); upsert persists remote URL and branch.
- [x] **m03-02** — Vault settings endpoints: guarded `GET /api/vault/config`
      returns the current config (never the SSH key material) and
      `PUT /api/vault/config` validates and stores remote URL, branch, and
      display name.
      Verify: `npm test --workspace server -- vault-config-api.test.ts` — unauth
      is 401; authed GET returns config without key contents; PUT persists and
      rejects an invalid remote URL.
- [ ] **m03-03** — Git runner: run git with argv (no shell) and
      `GIT_SSH_COMMAND="ssh -i <key> -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"`,
      returning stdout/stderr/exit and surfacing failures.
      Verify: `npm test --workspace server -- git-runner.test.ts` — `git init`/
      `add`/`commit` in a temp repo succeed; the built `GIT_SSH_COMMAND`
      references the configured key path and `IdentitiesOnly=yes`.
- [ ] **m03-04** — Clone/pull into the workspace: if the workspace is empty,
      `git clone` the configured remote/branch into
      `workspaces/second-brain/`; if it exists, verify it is a git repo with the
      expected remote and pull the branch; record last commit + last pull.
      Verify: `npm test --workspace server -- vault-clone.test.ts` — cloning
      from a local `file://` remote succeeds and records the commit; a re-run
      pulls; a workspace with a different remote is refused.
- [ ] **m03-05** — Vault detection checks: after clone/pull, report presence of
      `README.md`, `.clinerules/00-role.md`, `.clinerules/10-structure.md`,
      `memory/index.md`, `library/catalog.md`, `scripts/health.py`.
      Verify: `npm test --workspace server -- vault-detect.test.ts` — a seeded
      workspace reports all present; a missing marker is flagged.
- [ ] **m03-06** — Vault clone/status endpoints: guarded `POST /api/vault/sync`
      runs the clone/pull flow; `GET /api/vault/status` returns clone state,
      branch, commit, last pull, and detection results.
      Verify: `npm test --workspace server -- vault-status-api.test.ts` — unauth
      401; after configuring a local remote, POST sync returns ready + commit;
      GET status shows branch/commit/detection.
- [ ] **m03-07** — Vault settings page (`web/`): guarded screen to set remote
      URL + branch + display name, trigger a sync, and show clone state, branch,
      and commit; error states; responsive.
      Verify: prod build served by Fastify; authenticated headless load of the
      settings route shows the form and status; 390×844 screenshot;
      `npm run lint && npm test && npm run build` pass.
- [ ] **m03-08** — Milestone deliverable check: the owner can configure a repo
      and clone it into the data root, and the UI shows branch and commit.
      Verify: end-to-end against a local test remote with a running server —
      configure, sync, and confirm status shows branch + commit; full
      lint/test/build; no secrets, keys, or checkouts tracked by git.
