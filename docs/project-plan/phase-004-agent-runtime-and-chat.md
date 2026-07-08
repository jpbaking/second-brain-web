# Phase 004 - Agent Runtime And Chat

## Goal

Expose the Second Brain secretary through a browser while preserving the Cline
workflow model and vault invariants.

## SDK Direction

Use Cline SDK (actual package names and entry points are confirmed by the
Milestone 0 spike) because the app needs:

- Persistent agent sessions.
- Checkpoints/session resume where supported by the SDK.
- Workspace-aware tool execution.
- Built-in tools.
- Tool approval flow.
- Event streaming to the UI.
- Session lifecycle management.

Implementation agents must verify exact SDK APIs against current Cline SDK docs
before coding.

The SDK is a framework for building agents, not a headless build of the Cline
VS Code extension. Do not assume extension behaviours exist in it:

- `.clinerules/` auto-loading may not happen; the app must inject rules into
  the system prompt itself.
- `/workflow.md` slash behaviour may not exist; the app must expand workflow
  files into task prompts.
- `.cline/skills/` may not load; treat skills as unavailable until verified.
- Hooks will not fire — including the vault's PreToolUse guard that blocks
  edits to `library/` originals. The app MUST enforce an equivalent guard as
  tool policy on the SDK's file tools (see phase-003); this is mandatory, not
  optional hardening.

Milestone 0 in the roadmap is a feasibility spike that validates these
assumptions plus multi-turn session resume after process restart and the
headless approval flow, before any web scaffolding. The spike's findings
decide whether SDK resume or app-side rehydration is the primary continuity
path.

The SDK provider layer should be used rather than hard-coding one vendor. The
current SDK docs describe `@cline/llms` as the provider registry/gateway layer,
with provider config including `apiKey`, `baseUrl`, headers, and
provider-specific settings. The app should model provider selection around that
shape.

## Provider And Model Selection

The app should support provider/model profiles. A profile is the unit a chat
session runs with.

Profile fields:

- Profile ID
- Display name
- Provider ID
- Model ID
- API key secret reference, if needed
- Base URL, for OpenAI-compatible or local providers
- Optional custom headers
- Optional provider config JSON
- Enabled flag
- Default flag

MVP provider targets:

- Anthropic/Claude via API key.
- OpenAI/ChatGPT-family models via API key.
- OpenAI-compatible endpoint via API key plus base URL.
- LM Studio through an OpenAI-compatible local endpoint, when the host exposes
  LM Studio's server to the app runtime.

Nice-to-have later:

- Google Gemini.
- AWS Bedrock.
- Mistral.
- OpenRouter.
- Ollama/local providers.
- Provider-native OAuth/account linking where the SDK and provider support it.

## Provider Settings UX

The settings screen should allow the owner to:

- Add a provider profile.
- Choose provider type.
- Enter model ID.
- Enter API key or mark key as not required.
- Enter base URL for OpenAI-compatible/local endpoints.
- Test the provider with a small prompt.
- Set a default profile.
- Disable or delete a profile.

Sensitive fields should not be echoed after save.

## Per-Session Model Choice

When creating a chat session, default to the configured default provider profile
but allow choosing another enabled profile.

The selected profile should be stored on the chat session so a long-running
conversation does not silently switch model midway. The UI can offer an explicit
"switch model for this session" action that records the switch in the timeline.

## Local Model Notes

LM Studio should be treated as an OpenAI-compatible provider profile:

- Provider ID: `openai-compatible` or the SDK's current equivalent.
- Base URL: the LM Studio server URL visible from the app runtime.
- Model ID: the model name served by LM Studio.
- API key: optional or placeholder depending on LM Studio configuration.

The implementation must account for container networking. If the app runs in
Docker and LM Studio runs on the host, `localhost` inside the container is not
the host. The setup UI should allow an explicit base URL and test request.

## Session Model

App session concepts:

- Web auth session: proves owner identity.
- Chat session: named conversation in app UI.
- Agent session: Cline SDK runtime bound to a chat session.
- Vault writer lock: exclusive mutation guard.

Because the vault rules require substantive chat facts to be filed ("nothing
evaporates"), nearly every non-read-only session is a potential writer.
Expect all writing sessions to serialise behind the single-writer lock in
practice; this is acceptable for one principal. The chat UI should show when
a session is waiting on the lock and which session currently holds it.

A chat session should store:

- ID
- Title
- Created timestamp
- Updated timestamp
- Vault commit at start
- Last known vault commit
- Provider profile ID
- Provider/model snapshot at session start
- Approval preset snapshot at session start
- Agent session identifier
- SDK persistence/checkpoint reference, where available
- Message/event transcript or pointers to SDK storage
- Current context summary, if compaction has occurred
- Compaction history
- Archived flag

## Session Persistence And Context Continuity

The web app should feel like returning to a Cline session, not opening a generic
chatbot tab.

Requirements:

- Returning to a chat session should preserve the conversational thread, tool
  timeline, approvals, provider/model snapshot, approval preset, vault commit
  state, and current task state.
- Browser refresh, reconnect, or switching sessions should not discard active
  task context.
- Use Cline SDK persistence/checkpoints/session resume where the SDK supports
  it. App-side message storage is not enough by itself.
- Store app-owned metadata alongside SDK session state: vault commit, branch,
  dirty state, lock state, approval preset, provider profile, and source
  coverage/provenance links.
- If SDK session state cannot be resumed exactly, the app must create a clear
  recovery path that rehydrates the agent with the last compacted summary,
  relevant transcript tail, vault state, and task status.
- The Milestone 0 spike determines which of these is the primary path. If SDK
  resume across process restarts proves weak, design rehydration as the main
  mechanism from the start rather than a fallback.

The distinction matters:

- Chat session context is working memory for the current conversation/task.
- Vault memory is durable, dated, cited memory under `memory/`.

Do not rely on chat history as durable memory. Substantive facts still need to
be filed into the vault.

## Context Compaction

Long-running sessions need explicit context management.

MVP should support:

- Manual compaction: the principal can trigger "compact context" for a session.
- Compaction preview or summary record: the app should store what was kept and
  what was summarised.
- Timeline event: compaction should appear in the session timeline.

Deferred to just past MVP:

- Automatic compaction when token budget, transcript size, or SDK context
  warning thresholds are reached. The secretary model is naturally
  task-scoped — run a workflow, commit, done — so short sessions plus manual
  compaction cover MVP. The stored-summary format and timeline events should
  be designed so the automatic trigger can be added without rework.

The compacted summary should preserve:

- Current objective and open questions.
- Important decisions made in the session.
- Files/pages touched.
- Tool actions and pending approvals.
- Vault branch/commit/dirty state.
- Provider/model and approval preset.
- Links to generated reports or source coverage.
- Facts that still need vault filing.

Compaction must not silently erase obligations. If the session contains
unfiled substantive facts, pending commitments, or unresolved tool approvals,
the compaction summary should flag them.

## Chat UX

Required MVP UI:

- Session list.
- New session button.
- Chat message stream.
- Tool call timeline.
- Approval prompts.
- Workflow shortcut bar.
- Vault status strip: branch, commit, dirty/clean, lock status, health status.
- Context status: current provider/model, approval preset, token/context
  pressure if available, and last compaction timestamp.
- Manual compact button for long sessions.

Messages should stream as the agent responds.

## Workflow Shortcuts

Shortcut buttons should enqueue normal user messages, for example:

- `/inbox.md`
- `/recall.md <question>`
- `/report.md <request>`
- `/checkup.md`
- `/weekly.md`

If the SDK does not implement Cline's slash-command behaviour (verify in the
Milestone 0 spike), the app should read the referenced workflow file from
`.clinerules/workflows/` and send its content as the task prompt. Loading a
workflow file into a prompt is acceptable app code; reimplementing the
workflow's logic is not.

Do not reimplement the vault workflows in app code.

## Tool Approvals

The web UI must surface approval prompts for potentially sensitive operations:

- File writes.
- Shell commands.
- Git push.
- Report export.
- Network use, if enabled.
- Any operation touching credentials or app config.

Approval records should include:

- Session ID
- Tool name
- Requested command/path summary
- Timestamp
- Decision
- Principal identity, always owner in MVP

## Approval Presets

Approval presets define the default permission posture for a chat session or
task. They should map to Cline SDK permission/policy controls where available,
with app-side checks for operations the app owns.

Initial presets:

- Read-only: reads, searches, and report browsing only. Any file write, shell
  command, git operation, network call, export, or settings change requires
  approval or is blocked.
- Normal secretary: low-risk reads/searches can proceed; file writes, shell,
  git push, report export, network, provider changes, and sensitive operations
  require approval.
- High-trust local: routine local vault edits may proceed with fewer prompts,
  but destructive shell, credential access, auth/key changes, force push,
  external network, and sensitive exports still require approval.

The selected preset should be stored on the chat session and shown in the chat
header. Changing presets mid-session should create a timeline event.

## System Prompt / Rules Loading

The agent works inside the vault checkout. Expect to inject the vault rules
explicitly: SDK agents are unlikely to auto-load `.clinerules/` the way the
Cline extension does (verify in the Milestone 0 spike). Prepend or configure
the runtime to read:

- `.clinerules/00-role.md`
- `.clinerules/10-structure.md`
- `.clinerules/20-capture.md`
- `.clinerules/30-retrieval.md`
- `.clinerules/40-reports.md`

Workflow files remain available as files in the workspace.

## Chat Capture Implication

The vault rules require substantive facts shared in chat to be filed in
`memory/`. The app should not maintain an isolated "assistant memory" that
competes with this.

The chat transcript is useful for UI continuity, but recorded facts must be
captured into the vault by the agent.

## Event Streaming

MVP decision: use SSE first.

- SSE carries server-to-browser agent events.
- Browser-to-server actions use normal authenticated HTTP POST routes.
- WebSocket remains a future option behind a transport abstraction if the app
  later needs true bidirectional realtime.
- SSE streams must be reconnectable and heartbeat-enabled because reverse
  proxies and Cloudflare may close long-lived idle connections.

Stream event types:

- Assistant text delta.
- Tool call started.
- Tool call output.
- Approval requested.
- Approval resolved.
- Error.
- Session completed.
- Vault status changed.
- Context pressure/compaction suggested.
- Context compaction started/completed.

SSE requirements:

- Endpoint shape: `GET /api/sessions/:id/events`.
- Input shape: `POST /api/sessions/:id/messages`, `POST /api/approvals/:id`,
  and similar command routes.
- Use app session cookies for auth. Do not rely on custom request headers for
  browser `EventSource`.
- Emit `id:` values so clients can resume with `Last-Event-ID`.
- Send heartbeat comments every 15-30 seconds.
- Set event-stream headers: `Content-Type: text/event-stream`,
  `Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`.
- Persist events enough that reconnect can replay missed events.

## Error Handling

Errors should be actionable:

- Missing auth setup: tell operator to run reset script.
- Missing SSH key: tell operator to run key setup.
- Vault not cloned: show connect/clone action.
- Dirty checkout: show recovery state.
- Lock held: show active session and started time.
- SDK failure: preserve transcript and raw diagnostic in app logs.
- Session resume failure: offer recovery from last checkpoint or compacted
  summary.

## Future Enhancements

- Scheduled briefs.
- Voice dictation into chat.
- Browser notifications for completed reports.
- Per-session branches or worktrees.
- Rich diff review before commit/push.
