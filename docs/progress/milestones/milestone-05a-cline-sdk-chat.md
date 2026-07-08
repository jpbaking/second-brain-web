# Milestone 5A — Cline SDK Chat

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 5A;
`docs/project-plan/phase-004-agent-runtime-and-chat.md`; and the binding spike
decisions in `docs/spike/findings.md` (m00-10). Read those before starting.

Deliverable: the owner can chat with the agent in the vault workspace and
return to the session (browser refresh / server restart) without losing working
context.

Binding constraints (hard rules, from findings m00-10 + master plan):
- **Continuity = app-side rehydration.** Persist the chatSession → SDK
  sessionId mapping; on restart rehydrate with `readMessages(oldId)` +
  `start({ initialMessages })`. Live `send({ sessionId, prompt })` only within
  one process lifetime.
- **Mandatory `library/` tool-policy guard** ships with this first agent
  integration (not later): refuse non-catalog writes under `library/`.
  Implemented in the `requestToolApproval` path with explicit per-tool
  `toolPolicies` (unlisted tools must NOT silently auto-approve). Normalise
  `input.path` — relative and absolute both occur.
- **No rules-injection layer.** `.clinerules/` auto-load from the session cwd
  (the vault checkout). The app `systemPrompt` is supplementary only.
- **Workflows = app-side expansion**: read `.clinerules/workflows/<name>.md` and
  send `"Run the following workflow now.\n\n" + content`.
- Agent session artifacts must land under the app data root (set an explicit
  SDK data root if exposed; otherwise document the `~/.cline` default and the
  dedicated-system-user requirement). Never expose provider keys to the browser.
- All chat/agent routes are private (behind the m02 auth guard).

Packages: `@cline/core` 0.0.58 (+ transitive `@cline/llms`, `@cline/shared`),
Node ≥ 22. Surface used: `ClineCore.create` → `start`/`send`/`subscribe`/
`readMessages`/`stop`. Provider snapshot comes from m05
(`resolveDefaultSnapshot` / `resolveSnapshot`); LM Studio baseUrl **must** end
in `/v1`.

- [x] **m5a-01** — Agent runner scaffold: add `@cline/core` to the server
      workspace; a runner module maps a m05 `ProviderSnapshot` to the SDK
      provider config (anthropic / openai / openai-compatible → the right
      provider id + baseUrl, lmstudio baseUrl forced to end in `/v1`) and sets
      an explicit session data root under the app data dir. Keep the live SDK
      behind a small injectable interface so the rest of 5A unit-tests without a
      model.
      Verify: `npm test --workspace server -- agent-runner.test.ts` — snapshot→
      SDK-config mapping is correct per provider (incl. `/v1` normalisation and
      key passed through, never logged); data root resolves under the data dir.
- [x] **m5a-02** — `library/` tool-policy guard: a path normaliser + command
      classifier + explicit `toolPolicies` that DENY editor/write and shell
      mutations targeting non-catalog paths under `library/`, ALLOW catalog
      edits and shell `mv`, and never blanket auto-approve unlisted tools.
      Mirrors spike m00-09.
      Verify: `npm test --workspace server -- tool-policy.test.ts` — editor
      write to a `library/` original is denied (relative AND absolute paths);
      catalog edit + shell `mv` allowed; an unknown tool is not silently
      auto-approved.
- [x] **m5a-03** — Chat session + event store: core migration adds
      `chat_sessions` (id, title, provider profile id, sdk_session_id, status,
      timestamps) and `chat_events` (append-only: id, session id, seq, type,
      payload json, created_at); a store with create/list/get/rename/close,
      append-event, read-events-since, and the chatSession↔sdkSessionId mapping.
      Verify: `npm test --workspace server -- chat-store.test.ts` — CRUD +
      monotonic event seq per session + read-since replay + mapping round-trip.
- [ ] **m5a-04** — Agent session backend: create a session (capture the m05
      provider snapshot at start, cwd = vault checkout) and resume it via
      rehydration (`readMessages` + `initialMessages`) using the injected
      runner; persist the sdkSessionId mapping and turn events.
      Verify: `npm test --workspace server -- agent-session.test.ts` (fake
      runner) — new session persists mapping + events; resume after a simulated
      restart rehydrates from stored messages; snapshot captured at start is not
      mutated by a later profile edit.
- [ ] **m5a-05** — Chat HTTP routes (guarded): create session (with provider
      selection), list/get sessions, post a message, post a command, and the
      compaction action stub — all behind the auth guard, driving the backend.
      Verify: `npm test --workspace server -- chat-api.test.ts` — 401 unauth;
      create→list→get→post-message happy paths with a fake runner; bodyless
      POSTs accepted (no content-type/empty-body 400).
- [ ] **m5a-06** — SSE event stream: `GET /api/chat/sessions/:id/events` streams
      persisted + live events mapped from the SDK `subscribe` envelopes
      (status / agent_event / chunk / session_snapshot / ended), with monotonic
      event IDs, a heartbeat, and `Last-Event-ID` reconnect/replay from the
      store.
      Verify: `npm test --workspace server -- chat-sse.test.ts` — a client
      receives ordered events; reconnect with `Last-Event-ID` replays only newer
      events; heartbeat emitted; assistant text is cumulative on inner `text`.
- [ ] **m5a-07** — Approvals: promise-parking keyed by `toolCallId`; resolver
      routes (`approve` / `deny`) resolve the parked promise; resolvers are
      installed before `start()`. The tool-policy guard (m5a-02) runs first and
      auto-denies non-catalog `library/` writes without parking.
      Verify: `npm test --workspace server -- chat-approvals.test.ts` (fake
      runner) — a parked approval is resolved by the route and the turn
      continues; a guard-denied tool never parks; deny path reported as an event.
- [ ] **m5a-08** — Workflow shortcut messages: expand
      `.clinerules/workflows/<name>.md` app-side into the standard "Run the
      following workflow now." message; list available workflows from the vault
      checkout.
      Verify: `npm test --workspace server -- workflow.test.ts` — listing finds
      seeded workflow files; expansion produces the exact prefixed message;
      unknown workflow yields a clear error (no send).
- [ ] **m5a-09** — Chat web UI: `/chat` becomes a real screen — session list,
      message view (streaming via SSE), a composer, provider selection for a new
      session, an approval prompt affordance, and resume after browser refresh.
      Wired into the shell nav (replaces the stub).
      Verify: prod build; authenticated headless load of `/chat` shows the list
      + composer; SSE reconnect after reload restores the transcript; 390×844
      screenshot; `npm run lint && npm test && npm run build` pass.
- [ ] **m5a-10** — Milestone deliverable check (LIVE): end-to-end against a real
      model — LM Studio (`lmstudio`, baseUrl `…/v1`) or a configured cloud
      profile — the owner sends a message, sees a streamed reply, an approval
      round-trips, a `library/` non-catalog write is refused, and the session
      survives a browser refresh AND a server restart (rehydration).
      NOTE: needs a reachable model (LM Studio or a provider key) — may block on
      the principal to start LM Studio or supply a key.
      Verify: live run with evidence in the journal; full lint/test/build; grep
      to prove no provider key leaked to the browser or logs.
