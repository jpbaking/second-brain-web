# Second Brain Web - Master Plan

This folder is the implementation reference pack for `second-brain-web`, a
self-hosted, single-user web application for operating a Second Brain vault.

The app is not the memory system. The git-backed Second Brain repository is the
memory system. This app is the private console that authenticates the principal,
runs the agent, manages vault checkout/sync, accepts uploads, exposes reports,
and eventually visualises the vault.

## Current Product Decision

- Deployment model: self-hosted, one user per app instance.
- Auth model: password + TOTP, generated on first run or reset from host shell.
- Git auth model: dedicated SSH deploy key per vault repository.
- Vault model: clone/check out the Second Brain repository into app-managed
  runtime storage, then maintain it there.
- Agent runtime: use Cline SDK, because the web app needs long-running
  sessions, tool use, approvals, persistence, and filesystem work inside a
  real workspace. The SDK is a framework for building agents, not a headless
  build of the Cline VS Code extension: `.clinerules/` auto-loading,
  `/workflow.md` slash behaviour, skills, and hooks may not exist in it. The
  app must provide those itself (rules injection, workflow-file expansion,
  mandatory tool-policy guards). Implementation starts with a feasibility
  spike (Milestone 0 in the roadmap) that validates these assumptions before
  any web scaffolding.
- Chat sessions: preserve Cline-like task context across browser reconnects and
  session switches. Use SDK persistence/checkpoints where available, and add
  manual plus automatic context compaction.
- Model access: support configurable providers and models. MVP should support
  BYO API keys and OpenAI-compatible base URLs; later versions may add
  provider-native OAuth or account linking where the provider and SDK make that
  practical.
- Memory model: keep the existing Second Brain vault as canonical. Any search,
  graph, vector, or database layer is a rebuildable sidecar.
- User experience: desktop and mobile friendly from the first implementation.
  The app must support both deliberate desk work and fast phone capture/review.
- Design system: use `jpbaking/lazyway-io-design` as the required visual and
  component foundation. Do not invent a separate SaaS theme.
- Multi-tenancy: intentionally out of scope. Other users should self-host their
  own instance.

## Reference Vault Contract

The target vault is the `second-brain` repo. The web app must preserve these
invariants:

- `inbox/` is the principal's dump zone.
- `library/YYYY/` stores originals, renamed and moved but never edited.
- `memory/` contains all agent-authored synthesis, dated facts, indexes, and
  append-only log entries.
- `reports/` contains generated markdown/HTML/PDF reports.
- `.clinerules/` defines agent role, structure, capture, retrieval, reports,
  hooks, and workflows.
- `scripts/health.py` is the mechanical health check and should run after
  mutating workflows.

The app must never treat a derived database, embedding store, or chat transcript
as a substitute for filing facts into `memory/`.

## Document Map

- [phase-001-product-and-scope.md](phase-001-product-and-scope.md)
  Defines the user experience, core workflows, non-goals, and acceptance
  criteria.
- [phase-002-security-auth-and-secrets.md](phase-002-security-auth-and-secrets.md)
  Defines single-user password+TOTP auth, sessions, reset flow, deploy keys,
  and secret storage.
- [phase-003-vault-runtime-and-git.md](phase-003-vault-runtime-and-git.md)
  Defines local checkout layout, git sync, locking, health checks, report
  serving, and vault lifecycle.
- [phase-004-agent-runtime-and-chat.md](phase-004-agent-runtime-and-chat.md)
  Defines the Cline SDK integration, session model, approvals, tool events,
  provider/model selection, command shortcuts, and chat persistence.
- [phase-005-files-reports-and-derived-indexes.md](phase-005-files-reports-and-derived-indexes.md)
  Defines upload handling, report hosting, lexical search, optional vectors,
  and the memory/library explorer.
- [phase-006-implementation-roadmap.md](phase-006-implementation-roadmap.md)
  Defines a practical implementation sequence for another agent.
- [phase-007-deployment-operations-and-threat-model.md](phase-007-deployment-operations-and-threat-model.md)
  Defines host layout, environment variables, backups, observability, and
  security risks.
- [phase-008-feature-backlog-and-design-hooks.md](phase-008-feature-backlog-and-design-hooks.md)
  Captures non-MVP features and the MVP design hooks needed to leave room for
  them.
- [phase-009-design-system.md](phase-009-design-system.md)
  Defines how to apply `jpbaking/lazyway-io-design` to the web app.
- [phase-010-devops-proxy-and-sse.md](phase-010-devops-proxy-and-sse.md)
  Defines Nginx Proxy Manager, Cloudflare Tunnel/Access, and SSE deployment
  notes.

## Suggested Stack

- Runtime: Node.js 22+.
- Web framework: a plain long-lived Node service (for example Fastify or
  Express) serving a Vite/React front end. Framework route handlers in the
  Next.js style are not a good home for the agent runtime: agent runs, SSE
  streams, the writer lock, and git operations must live in a long-lived
  process outside HTTP request lifecycles, with SQLite as the event log that
  SSE routes replay from.
- UI/design: `jpbaking/lazyway-io-design`, mounted at `/design/`, with its
  token and component styles loaded globally.
- Agent runtime: `@cline/sdk`.
- Database: SQLite for the self-hosted app state, configured for robustness:
  WAL mode, foreign keys enabled, short transactions, migrations, integrity
  checks, and backup-aware handling of `*.sqlite`, `*.sqlite-wal`, and
  `*.sqlite-shm` files.
- Auth crypto: Argon2id for password hashing, TOTP via a well-maintained OTP
  library, secure random bytes from Node crypto.
- Git operations: local `git` CLI with an app-specific `GIT_SSH_COMMAND`.
- Model/provider configuration: Cline SDK `@cline/llms` provider gateway,
  stored provider profiles, encrypted API keys, and support for
  OpenAI-compatible local endpoints such as LM Studio where available.
- Realtime: SSE-first. Use Server-Sent Events for server-to-browser agent
  streams, with normal authenticated HTTP POST routes for user messages,
  approvals, commands, and uploads. Keep a transport abstraction so WebSocket
  can be added later if true bidirectional realtime is needed.
- File storage: local persistent volume mounted at an explicit data directory.

## SQLite Robustness Contract

SQLite is the app database for the self-hosted, single-user deployment. Use it
for app state and rebuildable indexes, not as the canonical vault.

Required practices:

- Enable WAL mode: `PRAGMA journal_mode = WAL`.
- Enable foreign keys on every connection: `PRAGMA foreign_keys = ON`.
- Keep transactions short.
- Use explicit migrations with a stored schema version.
- Run a startup migration/integrity check before serving authenticated traffic.
- Separate core app tables from rebuildable sidecar indexes.
- Treat SQLite as local-disk state; do not run it on unreliable network
  filesystems.
- Back up the main database and WAL/SHM state safely, or checkpoint before file
  copies.
- Keep vault contents, library originals, memory facts, reports, and git
  history outside SQLite.

Core app tables include auth sessions, chat/session metadata, approvals,
provider profiles, vault config, report metadata, source coverage, and audit
events. Rebuildable sidecar tables include search indexes, derived file lists,
link graphs, and optional embeddings.

## Default Runtime Layout

Use a data root outside the application source tree:

```text
/data/second-brain-web/
  auth/
    owner.json
  db/
    app.sqlite
    app.sqlite-wal
    app.sqlite-shm
  secrets/
    provider-keys.enc
  ssh/
    second_brain_ed25519
    second_brain_ed25519.pub
  workspaces/
    second-brain/
  indexes/
    vault.sqlite
  logs/
  sessions/
```

The source repo should remain disposable. The data root is the durable state.
`db/app.sqlite` holds core app state. `indexes/vault.sqlite` is rebuildable
derived state. `sessions/` stores SDK/session persistence when the Cline SDK
uses filesystem-backed state.

## First Implementation Target

Implementation begins with the Milestone 0 Cline SDK feasibility spike (see
the roadmap); nothing web-facing should be scaffolded until the spike has
answered its questions. After the spike, the first shippable version should
let the principal:

1. Start the app.
2. Run host setup/reset to generate password, TOTP, and SSH key material.
3. Add the public SSH key as a write deploy key to the private vault repo.
4. Log in with password + TOTP.
5. Connect or configure the vault git URL.
6. Clone/pull the vault into runtime storage.
7. Start a chat session backed by Cline SDK in the vault workspace.
8. Configure at least one model provider/profile.
9. Upload files/folders through an intake wizard into `inbox/`.
10. Run core workflows: inbox, recall, report, checkup.
11. See a daily command center with inbox backlog, reminders, commitments,
    vault health, dirty git state, and recent reports.
12. Use quick capture from desktop or phone.
13. Choose an approval preset appropriate to the current task.
14. Review vault diffs before commit/push.
15. View generated reports through the authenticated web UI.
16. Compact long-running chat context manually without losing durable vault
    memory.

Deferred to just past MVP: automatic context compaction and the source
coverage view. Both remain design constraints (leave seams for them) but are
not first-ship features.

## Hard Rules For Implementers

- Do not introduce signup or multi-user account management.
- Do not store plaintext passwords.
- Do not store deploy keys in git or browser local storage.
- Do not store provider API keys in browser local storage.
- Do not expose reports without auth.
- Do not expose any vault, app, session, report, upload, search, or API data
  without app auth. Public unauthenticated surface is limited to login/setup
  screens and static non-sensitive design assets.
- Do not bypass the vault's `.clinerules/` contract.
- Do not edit files under `library/` except catalogs. The app MUST enforce
  this itself with a tool-policy guard on the agent's file tools: the vault's
  own PreToolUse hook is a Cline extension feature and will not fire under
  the SDK, so the app-side guard is the only enforcement.
- Do not encrypt provider keys with the session secret. The dedicated
  `SECOND_BRAIN_WEB_SECRETS_KEY` is the only key-encryption option; if it is
  not configured, refuse to store provider keys.
- Do not let two write sessions mutate the vault concurrently in the MVP.
- Do not make a vector DB or SQL DB the canonical memory.
- Do not push automatically if health checks fail, unless the user explicitly
  approves a recovery path.
- Do not design desktop first and leave mobile as a later retrofit. Core
  workflows must be usable on phone-sized screens from MVP.
- Do not create a bespoke visual theme when the lazyway design kit has an
  applicable class/component/token.
- Do not implement chat as a shallow message log. Session state, tool history,
  approvals, checkpoints, and compaction summaries must be treated as part of
  the working context.

## Open Decisions

- Cline SDK production API details are resolved by the Milestone 0 feasibility
  spike, not deferred to mid-implementation discovery.
- Whether `library/` originals should move to git-lfs if the vault repository
  grows uncomfortably large (originals are PDFs, images, and office documents
  that accumulate per year). Not adopted now; monitor clone size and revisit.
- Exact provider catalog should be discovered from Cline SDK at runtime where
  possible instead of hard-coded into the UI.
- Whether generated reports are served directly from the vault checkout or
  through an app-managed cache. Direct authenticated serving is simpler.
- Whether the first version commits after every successful write workflow or
  batches commits per session. Per-workflow commit is easier to audit.
- Which notification channel, if any, should ship first. The MVP can expose
  in-app command center alerts and leave external notifications for later.
- Whether the design kit should be vendored by copying from the GitHub repo,
  added as a git subtree/submodule, or consumed through a package if one exists
  at implementation time. The runtime app should still serve the kit locally.
