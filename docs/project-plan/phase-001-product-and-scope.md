# Phase 001 - Product And Scope

## Product Summary

`second-brain-web` is a private web console for operating a Second Brain vault.
The principal chats with an AI executive secretary, uploads raw material, asks
for cited recall, generates reports, and reviews the vault's library and memory.

The app exists to make the existing Cline-operated vault usable outside VS Code
without weakening the repo's file-based, git-backed discipline.

The app must be immediately comfortable on both desktop and mobile. Desktop is
for deeper chat, reports, diffs, and review. Mobile is for quick capture,
checking the day's queue, reading briefs, and approving low-risk actions when
appropriate.

The visual design must use `jpbaking/lazyway-io-design`: restrained,
work-focused, blue/white with the kit's single amber accent rule, IBM Plex
typography, class-first components, and plain understated copy.

## Target User

One principal per app instance:

- Senior engineer, architect, lead, founder, or manager.
- Handles sensitive people, project, meeting, and career data.
- Wants a private assistant that remembers, files, retrieves, and reports.
- Is comfortable self-hosting or running a private service.

## Core User Workflows

### Login

The principal opens the app, enters the owner password, then enters a TOTP code.
There is no signup page, no user list, and no self-service password reset.

### Connect Vault

The principal configures a git remote for the Second Brain repo. The app uses a
dedicated SSH deploy key to clone and push.

### Chat With Secretary

The principal opens a chat session, asks questions, gives instructions, or
shares facts. The backend runs the agent in the checked-out vault workspace.

The agent's answer must be streamed to the UI. Tool calls and approval prompts
must be visible where relevant.

### Daily Command Center

After login, the principal should land on an operational dashboard:

- Inbox backlog.
- Overdue and upcoming reminders.
- Waiting-on commitments and I-owe commitments.
- Vault health status.
- Git clean/dirty/push status.
- Recent reports.
- Active session and write-lock state.

This is the secretary "keeping watch" surface. It should be useful before the
principal types anything.

### Quick Capture

The principal needs a small, fast capture box for facts, reminders, commitments,
and thoughts. It should be usable on phone with minimal friction.

The backend should route quick capture through the agent and vault workflow,
not store it as an app-only note. Captured facts must still land in `memory/`
with dates, indexes, and log entries.

### Upload Files Or Folders

The principal uploads files or a folder tree. The app writes uploaded material
into `inbox/` without interpretation. The agent later processes it through the
vault's `/inbox.md` workflow.

The upload flow should include an inbox intake wizard. The wizard lets the
principal add optional context such as what the material is, when it was
received, related people/projects, urgency, and desired handling. The file
content still lands unchanged in `inbox/`; the context becomes companion
metadata or an agent prompt for better filing.

### Run Common Workflows

The UI should expose shortcut buttons for frequent workflows:

- Process inbox
- Recall
- Meeting
- Prep
- Brief
- Weekly
- Report
- Checkup

Shortcut buttons should send normal chat messages or commands to the agent, not
create a parallel implementation of vault logic.

### Approval Presets

The app should offer approval presets that control how cautious the agent
runtime is for a task or session.

Initial presets:

- Read-only: allow search/read/report browsing; require approval for writes,
  shell, network, git, and exports.
- Normal secretary: allow low-risk reads/searches; require approval for file
  writes, shell, git push, provider changes, and sensitive exports.
- High-trust local: allow a broader set of local vault operations while still
  requiring approval for destructive commands, credential access, network use,
  force push, and auth/key changes.

The active preset must be visible in chat and approval UI.

### Follow-Up Queue

The app should expose reminders and commitments as a first-class queue, derived
from `memory/notes/reminders.md` and `memory/notes/commitments.md`.

The queue should support at least:

- Overdue.
- Due today.
- Due this week.
- Waiting on others.
- I owe.
- Completed items when detectable.

Editing/completing queue items should go through the agent or a vault-safe
write path that preserves log/index discipline.

### Review Before Commit

After a mutating agent workflow, the principal should see a concise review:

- Files changed.
- Library originals moved/catalogued.
- Memory pages changed.
- Reports created.
- Health-check summary.
- Proposed commit message.

The user can approve commit/push, ask the agent to revise, or leave changes
local for manual recovery.

### View Reports

The principal can browse generated reports under `reports/`, open HTML reports,
download PDFs, and see basic metadata such as title, path, generated date, and
source workflow.

The MVP report browser should behave like an internal report shelf, not merely a
directory listing. It should show recent reports, pinned/favourite reports if
simple to implement, and retain provenance hooks so regenerate-from-same-request
can be added cleanly later.

### Source Coverage View

For reports and cited answers, the app should show source coverage where data is
available:

- Memory pages cited.
- Library originals referenced through catalogs or report sources.
- Report/source gaps noted by the agent.
- Vault commit used to generate the output.

This view is for trust and review. It does not replace the report's own
citations.

### Search And Explore

The principal can search memory and report content. Later versions can visualise
people, projects, meetings, decisions, topics, and source links.

## MVP Scope

MVP must include:

- Single-user password + TOTP auth.
- Host-level first-run/reset script.
- SSH deploy-key based git clone/pull/push.
- One configured vault.
- Responsive desktop and mobile layouts for all core screens.
- Daily command center.
- Follow-up queue from reminders and commitments.
- Approval presets.
- Multi-session chat UI.
- Cline-like session persistence and context continuity.
- Manual and automatic context compaction.
- SSE-first event streaming with reconnect support.
- Backend Cline SDK session per chat.
- Quick capture.
- Inbox intake wizard and upload to `inbox/`.
- Workflow shortcuts.
- Authenticated report browser.
- Source coverage view for reports/cited answers where available.
- Review-before-commit/push diff summary.
- Single-writer lock for vault mutations.
- Run `scripts/health.py` after write-oriented workflows.

## Explicit Non-Goals

- Multi-tenant SaaS.
- Multiple users inside one app instance.
- Signup, invitations, organisation management, billing.
- Replacing markdown memory with a database.
- Generic RAG over arbitrary docs without filing into the vault.
- Editing vault originals through a general file manager.
- Browser-based git credentials.
- Public unauthenticated serving of reports, vault files, uploads, search, chat,
  or API data.

## UX Principles

- The first screen after login should be the working console, not marketing.
- Dense, utilitarian, private-tool UI. Avoid decorative landing-page treatment.
- Use the lazyway design kit as the source of styling truth. Prefer kit classes,
  tokens, React components, and chart helpers before writing custom UI/CSS.
- Mobile is not a reduced product. At minimum it supports command center,
  quick capture, follow-up queue, chat, uploads, report reading, and approvals
  that are safe to make away from a desk.
- Always show which vault branch/commit the app is operating on.
- Make pending approvals and vault health visible.
- Prefer explicit actions for push, export, and destructive operations.
- Reports should feel like documents, not chat blobs.
- Copy should stay plain and understated, with British/Commonwealth spelling
  where the app itself authors prose.

## Acceptance Criteria

- A fresh self-hosted install can bootstrap credentials from shell.
- The owner can log in only with password + current TOTP.
- The app can clone the configured vault using its deploy key.
- The command center displays inbox, reminder/commitment, health, git, and
  recent report status.
- The core UI works at desktop and phone viewport sizes.
- The owner can create two chat sessions and switch between them.
- A chat session survives refresh/reconnect with working context intact, or
  recovers from the last checkpoint/compacted summary.
- A long-running chat session can be compacted without losing task state,
  pending approvals, vault status, or unfiled facts.
- The owner can choose an approval preset and see it reflected in tool
  approval behaviour.
- A quick capture can be filed into the vault through the agent.
- A file uploaded through the intake wizard appears in the vault `inbox/`, with
  associated context available to the agent.
- A workflow command can process the inbox through the agent.
- Generated reports can be opened from the authenticated report browser.
- A report or cited answer can show the memory/library sources it used where
  the agent or report metadata exposes them.
- A mutating workflow presents a diff/health summary before commit/push.
- A write workflow creates auditable git changes.
- The app blocks concurrent vault writes in MVP.
