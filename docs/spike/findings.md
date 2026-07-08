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

Answered: 2026-07-08. **AUTO-LOADED — the plan's assumption was wrong in our
favour.**

- `spike/05-rules.mjs` A/B: identical prompt and `systemPrompt` ("You are a
  test assistant"), one run with `cwd` in the test vault, one in an empty
  directory.
  - In vault: "As the Principal's executive secretary and second brain, I
    treat original files as sacred — never editing… only moving and renaming
    them into `library/`" — near-verbatim `.clinerules/00-role.md`.
  - In empty dir: generic assistant reply, no vault markers.
- So the SDK discovers and applies `.clinerules/` from the workspace on its
  own (matching the search paths found in m00-01/02: `<ws>/.clinerules`,
  `<ws>/AGENTS.md`, `<ws>/.cline/rules`, plus user-global locations).
  **No rules injection layer is needed in the app.** Keep phase-004's
  injection design only as a documented fallback.
- Note: the workspace rules dominate our short `systemPrompt` — the app
  should treat `systemPrompt` as supplementary context, not the persona.
- Detector-design lesson: don't put marker words in the question (first run
  scored a false positive on "principal" being echoed back).

## m00-08 — Workflows and skills

Answered: 2026-07-08. **Workflows: app-side expansion required (as planned).
Skills: auto-loaded. Full inbox processing works end to end.**

- **Slash commands are NOT expanded by `@cline/core`.** Sending
  `/spike-test.md` as the prompt reaches the model as literal text (verified
  in the persisted message) and the model just guesses at its meaning. The
  extension/CLI layer owns that feature.
- **App-side expansion works cleanly** (`spike/06-workflow.mjs`): read
  `.clinerules/workflows/<name>.md`, send `"Run the following workflow
  now.\n\n" + content` — a marker workflow returned its exact expected
  output. This is what the web app's shortcut bar should do, and it is
  loading (not reimplementing) the vault workflow, per plan.
- **Skills auto-load** (`spike/07-skills.mjs`): the agent listed all five
  vault skills from `.cline/skills/` unprompted. Note: the host user's
  **global** `~/.cline/skills` merge in too — the app server should run
  under a dedicated user, or accept that merge (flag for phase-007).
- **End-to-end inbox processing PASSES with a local 9B model**
  (`spike/08-inbox.mjs`, 65s): a dummy note dropped in `inbox/` was moved to
  `library/2026/2026-07-08_maya-drill-note.txt` (correct date-prefix
  convention), catalogued, a new person dossier `maya-chen.md` was created
  with the accomplishment, `memory/log.md` got a proper ingest entry, all
  four index/catalog files were updated, and `scripts/health.py` still
  reports healthy. The vault rules do the heavy lifting; even a small model
  follows them.

## m00-09 — Tool-policy guard for library/

Answered: 2026-07-08. **PASS — the mandatory guard is implementable exactly
where planned.**

- `spike/09-guard.mjs` implements the guard as `requestToolApproval`
  middleware and verifies all three behaviours:
  1. `editor` write to a `library/` original → **denied**, file unchanged,
     and the model receives the denial reason and reports it instead of
     completing ("the workspace guard is preventing me…").
  2. `editor` append to `library/2026/catalog.md` → allowed.
  3. `bash` `mv` of an original within `library/` → allowed (move/rename
     stays legal, as in the vault's own hook).
- Production notes for the real implementation (milestone 5A):
  - `input.path` arrives **sometimes relative, sometimes absolute** —
    normalise against the workspace root before matching.
  - The `bash` command check here is a crude regex; the real guard needs a
    proper command classifier or a conservative deny-with-reason default,
    plus unit tests.
  - Editor read/view operations did not trigger approval — only mutations
    hit the callback, which keeps read flows fast under
    `autoApprove: false`.
- **Defence in depth observed:** inside the real vault the rules alone
  already made the model refuse to edit an original (it never attempted the
  tool call — we had to test the guard in a bare workspace to make the model
  try). Layers: vault rules (persuasion) → app guard (enforcement) → git
  history (recovery).
- Amusing pitfall: if the target file's content says "do not edit", the
  model obeys the file and never calls the tool. Guard tests must use
  neutral content.

## m00-10 — Go/adjust decisions

Answered: 2026-07-08. **GO.** Every plan-critical assumption is now proven,
and the SDK turned out friendlier than the plan feared. Decisions binding on
implementation:

1. **Continuity: app-side rehydration is the primary path.** Live SDK
   sessions die with the process (`session_not_found`); the app persists its
   chatSession → SDK sessionId mapping and rehydrates with
   `readMessages(oldId)` + `start({ initialMessages })` after a restart.
   Within one process lifetime, `send({ sessionId, prompt })` continues live
   sessions. `restore()` (checkpoint forking) is reserved for future
   review/undo features.
2. **Rules: no injection layer.** `.clinerules/` auto-load from `cwd`.
   Phase-004's injection design is demoted to documented fallback. The
   app-supplied `systemPrompt` is supplementary, not the persona.
3. **Workflows: app-side expansion.** The shortcut bar reads
   `.clinerules/workflows/<name>.md` and sends `"Run the following workflow
   now.\n\n" + content`. Slash text is not expanded by the SDK.
4. **Skills: nothing to build.** `.cline/skills/` auto-load. Deployment
   note: the host user's global `~/.cline/skills` (and global rules paths)
   merge in — run the app under a dedicated system user.
5. **Guard: implemented in `requestToolApproval` middleware** with
   per-tool `toolPolicies` set explicitly (unlisted tools default
   auto-approve — too permissive). Normalise `input.path` (relative and
   absolute both occur). Real command classifier + unit tests in 5A.
6. **Approvals: promise-parking works.** `toolCallId` is the correlation
   key; the app's approval routes resolve parked promises. Install resolvers
   before `start()` — approvals fire mid-turn.
7. **Packages: `@cline/core` (+ transitive `@cline/llms`, `@cline/shared`)
   at 0.0.58, Node ≥ 22.** `@cline/sdk` is just an alias. `ClineCore.create`
   → `start`/`send`/`subscribe`/`readMessages`/`stop` is the whole surface
   the app needs; sessions persist under `~/.cline/data/sessions/` (the app
   should set an explicit data root if the SDK exposes one, or document the
   default).
8. **LM Studio works as a provider** (`providerId: "lmstudio"`, baseUrl
   **must include `/v1`**) — the local-model MVP target is real. A 9B local
   model completed the full inbox workflow correctly in 65 s; cloud models
   will only be better.
9. **Event stream: `subscribe` envelopes** (`status`/`agent_event`/`chunk`/
   `session_snapshot`/`ended`) map cleanly onto the planned SSE event
   types; inner `agent_event.done` marks turn completion; assistant text is
   cumulative on inner `text`.

Net effect on the roadmap: milestone 5A gets *simpler* than planned (no
rules injection), and the compaction/continuity design in phase-004 stands
with rehydration as primary. No plan changes required beyond what this
document records.
