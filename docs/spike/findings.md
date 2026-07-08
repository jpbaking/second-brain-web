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

Not yet answered.

## m00-03 — Test vault

Not yet answered.

## m00-04 — Multi-turn conversation

Not yet answered.

## m00-05 — Resume across process restart

Not yet answered.

## m00-06 — Approval flow, answered asynchronously

Not yet answered (docs-level answer looks good; see m00-01 notes).

## m00-07 — .clinerules/ honoured or injected?

Not yet answered (docs are silent; expectation is injection).

## m00-08 — Workflows and skills

Not yet answered (docs are silent; expectation is prompt expansion).

## m00-09 — Tool-policy guard for library/

Not yet answered (mechanism identified: `requestToolApproval` +
`toolPolicies`; see m00-01 notes).

## m00-10 — Go/adjust decisions

Not yet answered.
