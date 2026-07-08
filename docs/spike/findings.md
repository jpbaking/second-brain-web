# Milestone 0 spike — findings

One section per checklist question. Each records the answer, the evidence,
and what it means for the app design. Sections are filled in as items
complete; unanswered sections say so.

## m00-01 — Packages, entry points, Agent construction

Answered: 2026-07-08, from docs.cline.bot and the npm registry (not yet
verified by running code — that is m00-02 onward).

### Packages (all real, all v0.0.58 at time of writing, Node >= 22)

| Package | npm description | Key exports per docs |
|---|---|---|
| `@cline/core` | "Cline Core SDK for Node Runtime" | `ClineCore`, `ClineCoreOptions`, `SessionRecord`, `AgentPlugin` — session persistence, built-in tools, automation |
| `@cline/sdk` | "user-facing alias for @cline/core" | re-exports `@cline/core` |
| `@cline/agents` | "Browser-safe agent runtime" | `AgentRuntime` (alias `Agent`), `createAgent`, `createAgentRuntime`; methods `run`, `continue`, `abort`, `subscribe`, `restore`, `snapshot` |
| `@cline/llms` | provider/model layer | `DefaultGateway`, `createGateway`, `createHandler`, `getAllProviders`, `registerProvider`, `registerModel` |
| `@cline/shared` | shared types/utilities | `createTool`, `AgentTool`, `AgentToolContext`, `ToolPolicy`, hook contracts, logging |

The plan docs' older `ClineCore` naming was close: `ClineCore` is the main
class in `@cline/core`. **Decision: install `@cline/core` (plus `@cline/llms`
and `@cline/shared` as needed) for the spike** — it is the Node runtime with
session persistence, which is what the web app needs. `@cline/agents` alone
is the browser-safe runtime *without* session storage.

### Construction and session API (per docs, unverified)

```typescript
const cline = await ClineCore.create({
  clientName: "second-brain-web-spike",
  backendMode: "auto",          // "auto" | "local" | "hub" | "remote"
  capabilities: { requestToolApproval: async (req) => ({ approved: true }) },
  toolPolicies: { /* per-tool { autoApprove } / { enabled } */ },
})
```

- Task start: `start(input)` with `prompt` and `config` (config includes
  `providerId`, `modelId`, `apiKey`, `systemPrompt`, `cwd`,
  `workspaceRoot`).
- Follow-up turns: `send({ sessionId, prompt })`.
- Sessions: identified by `sessionId`, persisted as file artifacts
  (`manifestPath`, `messagesPath` JSON); `list()` and
  `readMessages(sessionId)` exist. Docs claim restoration "across process
  restarts" by reloading prior state — **must be proven live (m00-05)**.
- The lower-level `Agent` also supports `restore(messages)` before
  `continue()`, which is a candidate rehydration mechanism.

### Approvals (promising — answers half of m00-06 on paper)

Two mechanisms per docs:

1. Static `toolPolicies`: per-tool `{ autoApprove: true }`,
   `{ autoApprove: false }` (waits for consent), `{ enabled: false }`
   (hidden from model). Unlisted tools default to enabled + auto-approved —
   **the app must therefore enumerate and set policies explicitly; the
   default posture is too permissive for us.**
2. Dynamic: `capabilities.requestToolApproval` — an async callback receiving
   `{ toolName, input }` and returning `{ approved: boolean }`. Promise-based,
   so it can be parked and resolved later from another code path (a web
   route). Policies are per-tool, not per-path, but the callback sees the
   tool `input`, so **path-level rules like the `library/` guard belong in
   this callback (or a policy wrapper around it)**.

### Rules / workflows / skills / hooks

The SDK documentation (overview, ClineCore reference, guides index) makes
**no mention** of `.clinerules/`, workflow slash commands, `.cline/skills/`,
or PreToolUse-style hooks. `@cline/shared` exports "hook contracts", meaning
some hook mechanism may exist in code, but nothing documents workspace-file
hooks. Plan assumption stands: expect to inject rules into `systemPrompt`,
expand workflow files into prompts ourselves, and enforce the `library/`
guard in our own approval callback. Live verification is m00-07/m00-08/m00-09.

### Useful doc pages (for later items)

- `/sdk/clinecore.md`, `/sdk/reference/cline-core.md` — core + options
- `/sdk/guides/permission-handling.md` — approval patterns
- `/sdk/reference/agent.md`, `/sdk/events.md` — runtime + event stream
- `/sdk/guides/going-to-production.md` — likely relevant for the real app

## m00-02 — Scaffold spike project

Answered: 2026-07-08. **PASS — ClineCore runs a real session against local
LM Studio.**

- `spike/` is a private ESM Node project with `@cline/core`, `@cline/llms`,
  `@cline/shared` at 0.0.58 installed.
- No cloud API key was available, but LM Studio is running on
  `localhost:1234`; per the principal, the spike model is
  **`ornith-1.0-9b@q4_k_m`** (a reasoning model — give it token headroom,
  its answer text follows a thinking block).
- `spike/01-hello.mjs` verification: session completed with agent events
  `iteration_start, content_start, usage, content_end, iteration_end, done`;
  assistant text captured from events; persisted messages file contains the
  assistant reply (thinking + text content blocks).

Gotchas learned (these will matter for the app):

- **`baseUrl` must include `/v1`** for the `lmstudio` provider
  (`http://localhost:1234/v1`). With a bare host:port the session fails fast
  with "Model returned empty response".
- Required config fields beyond provider/model: `systemPrompt`, `cwd`,
  `enableTools`, `enableSpawnAgent`, `enableAgentTeams`.
- Sessions persist under `~/.cline/data/sessions/<sessionId>/` as
  `<id>.json` (manifest) + `<id>.messages.json`; the messages file flushes
  shortly after completion, not instantly.
- Event stream shape: `cline.subscribe(cb)` delivers envelopes
  `{ type: "status" | "agent_event" | "chunk" | "session_snapshot" | "ended",
  payload: { sessionId, ... } }`; assistant deltas are `agent_event`s whose
  inner event carries `text` (cumulative across content events — dedupe when
  rendering).
- `providerId: "lmstudio"` is first-class; `getAllProviders()` lists ~50
  providers including `anthropic`, `openai-native`, `openai-compatible`,
  `ollama`, `openrouter`, `bedrock`, `vertex`.

Bonus discovery from the package's type surface (to verify live in later
items): `@cline/core` exports rules/workflows/skills config machinery whose
**search paths match the vault exactly** — rules from `<ws>/.clinerules` (and
`AGENTS.md`, `.cline/rules`), workflows from `<ws>/.clinerules/workflows`,
hooks from `<ws>/.clinerules/hooks` — plus `SqliteSessionStore`, checkpoint
`restore()`, and compaction strategy settings. The plan's pessimism about
extension features may be substantially wrong in our favour; m00-07/08 will
prove whether they load automatically.

## m00-03 — Test vault

Answered: 2026-07-08. **PASS.**

- Cloned the public data-free template `jpbaking/second-brain` into
  `spike/test-vault/` (git-ignored). Deliberately did **not** copy the
  principal's private vault (`second-brain-mine`) — the spike must never
  touch real people data.
- Seeded dummy data following the vault's own conventions: a people dossier
  (`alex-reyes.md`), a project page (`project-nimbus.md`), one library
  original + `library/2026/catalog.md`, leaf index entries, root
  index/catalog counts, and a `memory/log.md` entry.
- `python3 spike/test-vault/scripts/health.py` reports "Vault healthy: no
  mechanical issues found", so the seeded tree satisfies the mechanical
  invariants (index counts, catalog tree, navigation size rule).
- The template ships `.clinerules/` (5 rule files, workflows, hooks) and
  `.cline/skills/` — exactly the layout the SDK's config search paths
  resolve to, which m00-07/08 will exercise.

## m00-04 — Multi-turn conversation

Answered: 2026-07-08. **PASS.**

- `spike/02-multiturn.mjs`: `start({ interactive: true, ... })` then two
  `cline.send({ sessionId, prompt })` turns. A codeword planted in turn 1
  was recalled verbatim in turn 2 and transformed (lowercased) in turn 3.
- Turn boundaries are detectable from the event stream: the inner
  `agent_event` of type `done` marks a completed turn. Assistant text
  arrives cumulatively on inner events' `text` field (keep the last value
  per turn).
- **Accidental early answer to m00-07:** with `cwd` pointing at the test
  vault, turn 1's reply was in-character as the vault's executive secretary
  ("Filing codeword under `memory/topics/` — marked sensitive…") even though
  our `systemPrompt` said plain "test assistant". The SDK evidently
  discovered and applied `.clinerules/` from the workspace on its own.
  m00-07 will isolate and confirm this.

## m00-05 — Resume across process restart

Answered: 2026-07-08. **PASS — via rehydration, not live resume. This is the
spike's key architectural decision.**

- `spike/03a-resume-plant.mjs` plants a codeword and exits without
  `stop()` (simulated crash). `spike/03b-resume-continue.mjs` runs in a
  fresh process:
  - Plain `cline.send({ sessionId, ... })` fails with
    `session_not_found` — **live sessions exist only in process memory**.
  - Fallback works cleanly: `cline.readMessages(sessionId)` returns the
    persisted transcript, and `cline.start({ initialMessages, prompt })`
    continues the conversation with context intact (codeword recalled).
- **Decision for the app: app-side rehydration is the PRIMARY continuity
  path** (per phase-004's contingency). The web app must persist its own
  chatSession → SDK sessionId mapping; on reconnect-after-restart it
  rehydrates via `readMessages` + `initialMessages` under a new SDK session
  id. Within one server process lifetime, `send()` continues live sessions
  cheaply.
- `restore()` exists but is checkpoint-based session *forking*
  (`checkpointRunCount`, optional workspace git-snapshot restore) — useful
  later for review/undo features, not the plain reconnect path.

## m00-06 — Approval flow, answered asynchronously

Answered: 2026-07-08. **PASS — the exact shape a web app needs.**

- `spike/04-approval.mjs`: with `toolPolicies: { editor: { autoApprove:
  false } }` and a `capabilities.requestToolApproval` callback, the agent's
  `editor` tool call **paused** (requested at t=1.9s), the promise was parked
  in a pending map, and a separate timer loop — standing in for a web
  route — resolved it 3 seconds later (t=5.0s). The tool then executed and
  the file appeared with the right content.
- Callback contract: `(request: { sessionId, agentId, conversationId,
  iteration, toolCallId, toolName, input, policy }) =>
  Promise<{ approved, reason? }>`. `toolCallId` is the correlation key the
  app's approval routes will use.
- **`request.input` includes the target path** (e.g. `{ path:
  "inbox/approval-test.txt", new_text: "..." }`), so path-level rules like
  the `library/` guard can be decided here (m00-09).
- Built-in tool names in the agents runtime: `editor`, `bash`, `fetch`,
  `search` (the docs' `read_files`/`apply_patch`/`run_commands` naming
  belongs to the hub layer). Unlisted tools default to auto-approved, so the
  app must set explicit policies for every mutating tool.
- Gotcha that cost a timeout: install the external approval resolver
  *before* `cline.start()` — approvals fire mid-turn, and code that only
  runs after `await start()` may never run if the turn is blocked on the
  approval (deadlock).

## m00-07 — .clinerules/ honoured or injected?

Not yet answered (docs are silent; expectation is injection).

## m00-08 — Workflows and skills

Not yet answered (docs are silent; expectation is prompt expansion).

## m00-09 — Tool-policy guard for library/

Not yet answered (mechanism identified: `requestToolApproval` +
`toolPolicies`; see m00-01 notes).

## m00-10 — Go/adjust decisions

Not yet answered.
