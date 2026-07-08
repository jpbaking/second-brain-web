# Phase 006 - Implementation Roadmap

This is the suggested order for an implementation agent. Each step should leave
the app runnable or at least structurally coherent.

## Milestone 0 - Scaffold

Create the app skeleton:

- Package manager and Node version.
- Web framework.
- TypeScript.
- Lint/format/test commands.
- Basic app shell.
- Lazyway design kit mounted at `/design/`.
- Global loading of lazyway `styles.css` then `components.css`.
- Favicons copied/generated from the kit.
- Local SQLite connection.
- SQLite WAL mode and foreign keys enabled.
- Migration runner and schema version tracking.
- Startup database integrity/migration check.
- Separation between core app tables and rebuildable index tables.
- Config loader.
- Data root handling.

Deliverable:

- App starts locally.
- Health endpoint or status page shows missing setup.
- SQLite starts with WAL mode, foreign keys, and migrations in place.
- The first screen already uses the required lazyway styling contract.

## Milestone 1 - Host Bootstrap Scripts

Implement scripts:

- `scripts/reset-auth.sh`
- `scripts/generate-deploy-key.sh` or a combined setup script

The scripts should create data directories, generate owner auth, generate or
rotate SSH key, and print operator instructions.

Deliverable:

- Running the reset script produces a password and TOTP setup URI.
- Running the key script produces an SSH public key to add as deploy key.

## Milestone 2 - Authentication

Implement:

- Login page.
- Password verification.
- TOTP challenge.
- Server-side sessions.
- Logout.
- Route guards.
- Rate limiting.

Deliverable:

- App is inaccessible without password + TOTP.
- Existing sessions are invalidated on reset.

## Milestone 3 - Vault Configuration And Clone

Implement:

- Vault settings page.
- Git remote URL config.
- Branch config.
- SSH command handling.
- Clone/pull status.
- Vault detection checks.

Deliverable:

- Owner can configure a repo and clone it into the data root.
- UI shows branch and commit.

## Milestone 4 - Vault Status And Health

Implement:

- Git status readout.
- Dirty/clean state.
- Last commit.
- Run `scripts/health.py`.
- Parse and display health output.
- Command center data model for inbox backlog, reminders, commitments, recent
  reports, health, branch, commit, dirty state, and active lock.

Deliverable:

- Owner can run vault health check from UI.
- Owner lands on a useful command center after login.

## Milestone 4A - Responsive App Shell

Implement:

- Desktop navigation for command center, chat, follow-up queue, reports,
  settings, and vault status.
- Mobile navigation for the same core screens.
- Responsive layouts for command center, chat, quick capture, follow-up queue,
  upload, and report reader.
- Touch-friendly controls and readable report/browser views.
- Lazyway component classes and tokens for layout, cards, tables, forms,
  buttons, alerts, tabs, charts, and prose rendering.

Deliverable:

- Core workflows are usable on phone and desktop before deeper features are
  added.

## Milestone 5 - Provider Settings

Implement:

- Provider profile storage.
- API key entry and secret storage.
- OpenAI-compatible base URL support.
- Provider test action.
- Default provider profile.
- Session-level provider snapshot.

Deliverable:

- Owner can configure Anthropic, OpenAI, or an OpenAI-compatible endpoint such
  as LM Studio and choose the profile when starting a chat.

## Milestone 5A - Cline SDK Chat

Before chat implementation, verify the current Cline SDK provider APIs and
event APIs against official docs. Also verify SDK persistence, checkpoint, and
session-resume capabilities.

Implement:

- Chat session list.
- Chat message view.
- Backend agent session creation.
- SDK-backed session persistence/checkpoint reference.
- Provider profile selection for new sessions.
- Streaming assistant responses.
- SSE endpoint for agent/session events.
- HTTP POST routes for messages, approvals, commands, and compaction actions.
- SSE event IDs, heartbeat, and reconnect/replay support.
- Event persistence.
- Basic workflow shortcut messages.
- Session resume after browser refresh/reconnect.

Deliverable:

- Owner can chat with the agent in the vault workspace and return to the
  session without losing working context.

## Milestone 5B - Context Compaction

Implement:

- Manual compact action per chat session.
- Automatic compaction trigger based on token/context pressure when SDK data is
  available, otherwise transcript size thresholds.
- Stored compaction summaries.
- Session timeline events for compaction.
- Rehydration path from last checkpoint or compacted summary.

Deliverable:

- Long-running sessions can be compacted without losing task state, pending
  approvals, vault status, or unfiled facts.

## Milestone 6 - Tool Approvals And Write Lock

Implement:

- Approval preset model: read-only, normal secretary, high-trust local.
- Preset selection per chat session.
- Approval UI.
- Approval persistence.
- Single-writer lock.
- Lock status in UI.
- Recovery for abandoned locks.
- Review-before-commit summary from git diff/status and health output.
- Explicit approve commit/push action.

Deliverable:

- Owner can choose an approval preset for a session.
- Mutating sessions cannot concurrently edit the vault.
- Tool requests are visible and approvable.
- Owner can review changed files and health output before commit/push.

## Milestone 7 - Quick Capture And Uploads

Implement:

- Quick capture box.
- Quick capture routing to agent/vault workflow.
- Inbox intake wizard fields.
- Companion intake metadata for uploads.
- File upload.
- Folder upload if framework/browser support is straightforward.
- Safe writing into `inbox/uploads/...`.
- Post-upload action to start `/inbox.md`.

Deliverable:

- Owner can capture a thought from desktop or phone and have it filed through
  the vault workflow.
- Uploaded files appear in the vault inbox with optional intake context and can
  be processed by agent.

## Milestone 8 - Commit, Health, Push Loop

Implement:

- Detect changed files after mutating workflow.
- Run health check.
- Commit changes.
- Push changes through deploy key.
- Surface failures and recovery options.

Deliverable:

- Successful workflows are committed and pushed to the private vault repo.

## Milestone 9 - Report Browser

Implement:

- Scan reports.
- Serve reports behind auth.
- Open HTML reports.
- Download PDFs/Markdown.
- Recent report shelf.
- Optional pin/favourite metadata if cheap to implement.
- Basic source coverage extraction from report links and Sources sections.
- Source coverage panel for report detail pages.

Deliverable:

- Owner can browse generated reports without leaving the app.
- Owner can inspect the memory/library sources behind a report when available.

## Milestone 9A - Follow-Up Queue

Implement:

- Parse `memory/notes/reminders.md`.
- Parse `memory/notes/commitments.md`.
- Show overdue, today, this week, waiting-on, and I-owe filters.
- Link queue items back to source files where possible.
- Route completion or edits through a vault-safe write path.

Deliverable:

- Owner can use the app as a practical follow-up console, not only a chat
  surface.

## Milestone 10 - Derived Search

Implement:

- Scan `memory/`, report files, and catalogs.
- Build SQLite FTS index.
- Search UI.
- Rebuild on demand and after vault changes.

Deliverable:

- Owner can search vault memory and reports quickly.

## Milestone 11 - Explorer

Implement:

- Link extraction.
- Graph/list explorer.
- Area filters.
- Detail panel.

Deliverable:

- Owner can visually explore memory/library relationships.

## Milestone 12 - Production Hardening

Implement:

- Dockerfile or deployment guide.
- Reverse proxy notes.
- HTTPS assumptions.
- Backup/restore documentation.
- Secret permission checks.
- Structured logs.
- Minimal smoke tests.

Deliverable:

- App can be deployed as a self-hosted private service with durable data volume.
