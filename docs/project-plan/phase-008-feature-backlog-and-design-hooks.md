# Phase 008 - Feature Backlog And Design Hooks

This file captures useful features that should influence MVP design, even when
they are not mandatory for the first shippable release.

The goal is to avoid architectural dead ends. MVP should remain focused, but it
should leave clean seams for these future capabilities.

## MVP-Essential Features

These features are essential to the executive-secretary intent and should ship
in MVP:

- Daily command center.
- Follow-up queue over reminders and commitments.
- Quick capture.
- Approval presets.
- Multi-session chat.
- Cline-like session persistence and manual context compaction.
- SSE-first event streaming with reconnect support.
- Inbox intake wizard and file/folder upload to `inbox/`.
- Workflow shortcuts.
- Provider/model profile selection.
- Authenticated report shelf.
- Review-before-commit/push.
- Desktop and mobile responsive layouts.
- Single-writer vault lock.
- Vault health checks after mutating workflows.

## Near-Term Features

These should be considered soon after MVP, but the MVP can work without them.

### Playwright Integration Testing

Move away from disposable headless Chrome CDP scripts to a structured
Playwright integration testing suite. This may also involve setting up a
Playwright MCP server for seamless agent-driven visual verification.

Design hook:

- Ensure the testing harness can boot `buildApp` with a fake agent-runner and
  navigate the application easily. Keep testing setup isolated (e.g., `app/test/e2e`)
  without bloating the production server image.

### Automatic Context Compaction

Trigger compaction automatically on token/context pressure when SDK data is
available, otherwise on transcript size thresholds. Manual compaction ships
in MVP; the automatic trigger is the deferred part.

Design hook:

- The MVP compaction summary format and session timeline events must be
  reusable by the automatic trigger without rework.

### Source Coverage View

Show which memory pages and library originals a report or substantial cited
answer drew on, with the vault commit at generation time. Reports carry their
own inline citations in MVP, which covers the trust need at first ship.

Design hook:

- Report metadata should retain provenance from MVP onward: report path,
  generating session, and vault commit.

### Meeting Prep Mode

A guided form for meeting title, date, attendees, and objective. It should run
the vault `/prep.md` workflow and render the result as a prep pack.

Design hook:

- Workflow shortcuts should support structured parameters, not only raw text.

### Contradiction And Staleness Radar

A command-center panel for:

- Pages with warning markers.
- Projects not updated in 60+ days.
- People dossiers with no recent entries.
- Conflicting dated facts.
- Reports based on stale data.

Design hook:

- Command center data should include structured warning/staleness items.

### Principal Profile

A private settings area for working preferences:

- Default report kit/style.
- Preferred tone.
- Default meeting prep shape.
- Recurring project names.
- Timezone.
- Work week.
- People sensitivity rules.

Design hook:

- Settings should support principal preferences separate from provider/vault
  infrastructure settings.

### Session-To-Report

Turn a chat session into a report, decision, meeting note, or memory entry.

Design hook:

- Store enough session metadata to identify useful source messages without
  making chat transcript the canonical memory.

### Evidence Gap Prompts

For performance evaluations, project reports, and prep packs, surface missing
evidence as queue items.

Design hook:

- Reports and agent runs should be able to emit structured follow-up prompts.

### Scheduled Briefs

Daily and weekly scheduled agent runs:

- Morning brief.
- Weekly review.
- Stale project sweep.
- Overdue commitments sweep.

Design hook:

- Store scheduled job definitions and agent run metadata separately from chat
  sessions, while still allowing generated output to become reports/memory.

### Notification Hooks

Optional notifications for completed reports, overdue items, or failed syncs:

- Email.
- Telegram.
- Slack.
- Webhook.
- Browser push.

Design hook:

- Command center alerts should be represented as structured app events so later
  notification transports can consume them.

### Sensitive Data Mode

Extra controls for reports or pages with people-risk, performance, interview,
or attrition content.

Possible behaviours:

- Re-auth before opening sensitive reports.
- Mark report sensitivity.
- Redacted export.
- Stronger warning before sharing/downloading.

Design hook:

- Report metadata should allow optional sensitivity labels.

### Regenerate Report

A report shelf action that reruns the same report request against the current
vault state.

Design hook:

- Store report provenance: originating session, prompt/workflow, provider
  profile, vault commit, and generated path.

## Later Features

### Memory And Library Explorer

Interactive exploration of people, projects, meetings, decisions, topics,
reports, and library originals.

Design hook:

- Derived indexes should extract links and file metadata from day one, even if
  the graph UI ships later.

### Semantic Search

Optional embeddings/vector index over memory, reports, and catalogs.

Design hook:

- Keep sidecar indexes rebuildable and never canonical.
- Store embedding provider/config separately from chat provider profiles.

### Voice Capture

Phone-friendly voice dictation that routes to quick capture.

Design hook:

- Quick capture should be input-type agnostic: text now, audio transcript later.

### Rich Diff Review

A better review experience before commit/push:

- Semantic grouped diffs.
- Memory log preview.
- Report preview.
- Accept/revise per changed file.

Design hook:

- The basic MVP review should store changed-file summaries and health output in
  a structured form.

### Per-Session Worktrees

Use git worktrees or branches for isolated session changes.

Design hook:

- The session model should record vault commit, branch/worktree path, and merge
  status, even if MVP uses one checkout and a write lock.

### Backup And Restore UI

Host-level backup remains safest, but the app can show:

- Last git push.
- Last app DB backup.
- Dirty workspace warning.
- SSH key status.
- Provider key status.

Design hook:

- Operational status should be represented as first-class command center data.

### Calendar Import

Read-only calendar import or `.ics` upload for meeting prep and daily briefs.

Design hook:

- Meeting prep inputs should allow external calendar metadata later without
  changing the workflow concept.

### Share-Safe Export

Generate redacted/export-safe versions of selected reports.

Design hook:

- Reports should support sensitivity labels and export profiles.

### Panic Lock

A host or UI action that immediately revokes sessions, pauses agent runs, stops
report serving, disables git push, and requires host reset or re-auth to resume.

Design hook:

- Centralise auth/session/agent-run gating so a global lock can block all
  sensitive surfaces.

## Explicitly Deferred

- Multi-tenant SaaS.
- Multiple human users in one instance.
- Public report publishing.
- Browser-side secret storage.
- Replacing the vault with an app database.
