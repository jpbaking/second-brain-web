# Milestone 72 — repository-wide exception boundaries

Principal-directed 2026-07-13. Extend milestone 71's `error-extender`
foundation across the remaining server, CLI, and browser code so unexpected
failures cross subsystem boundaries as named, Java-style application
exceptions with complete `cause` chains and safe structured context.

## Contract

- `AppError` remains the server root. Subsystems expose named domain parents;
  leaf types exist only when callers need to distinguish a failure.
- When adding useful boundary context, wrap the lower-level exception with
  `cause: asError(error)`. If no context is added and the error already belongs
  to that boundary, rethrow it unchanged.
- Exception data may contain stable codes, operations, stages, request/session
  ids, and safe resource identifiers. It must never contain keys, auth headers,
  cookies, prompts, attachment/file contents, TOTP secrets, or full provider
  snapshots.
- Expected business outcomes stay explicit results (for example: no remote is
  configured, health reports issues, authentication is rejected). Unexpected
  execution failures become exceptions; do not collapse their causes into a
  message-only result.
- Catch only to recover deliberately, translate at a boundary, add context, or
  log once. Best-effort catches must be named/commented and log safely when the
  failure is operationally useful.
- HTTP and browser boundaries expose safe public messages/codes while log4js
  receives the complete private chained stack.

## Read before working

- `AGENTS-PLAYBOOK.md`
- `app/server/src/errors.ts`
- `app/server/src/logging.ts`
- `app/server/test/errors.test.ts`
- `docs/progress/milestones/archive/milestone-71-exceptions-and-logging.md`

## Checklist

- [x] **m72-01 — exception contract + generic runner boundary.** Add typed,
  reusable safe error metadata/wrapping helpers and an `AgentRunnerError`
  parent in `agent/runner.ts`; ensure every exception deliberately originating
  from that module crosses its boundary as `AgentRunnerError`, while preserving
  `normaliseOpenAiBaseUrl`'s intentional tolerant fallback. Add hierarchy,
  redaction, and chained-stack tests.
  Verify: `cd app && npm test --workspace server -- errors.test.ts agent-runner.test.ts && npm run lint --workspace server && npm run build --workspace server`

- [x] **m72-02 — Cline adapter boundary.** Add `ClineAgentRunnerError` beneath
  `AgentRunnerError`; wrap `ensureCore`, `start`, `send`, `subscribe` (including
  unsubscribe), `readMessages`, and `stop` with safe `operation`/`stage` data.
  Preserve normal no-op outcomes (missing vault; stop before core creation),
  keep MCP stdout protocol-clean, and test SDK/system causes without a live
  model.
  Verify: `cd app && npm test --workspace server -- cline-runner-errors.test.ts cline-runner-cwd.test.ts web-tools-registration.test.ts && npm run lint --workspace server && npm run build --workspace server`

- [ ] **m72-02a — Cline SDK and provider trace logging.** Bridge the SDK's
  `BasicLogger` to named log4js categories with runtime-allow-listed metadata,
  and inject a traced `fetch` for local provider traffic. SDK operational
  diagnostics log at debug; provider request/response summaries log at trace
  with method, sanitized host/path, status, duration, safe provider/session
  identifiers, attachment counts, and provider request ids where available.
  Never log query strings, headers, keys, prompts, request/response bodies, or
  streamed content. Cover level routing, sanitization, success, HTTP failure,
  and thrown fetch causes without making a live provider call.
  Verify: `cd app && npm test --workspace server -- cline-logging.test.ts cline-runner-errors.test.ts structured-logs.test.ts && npm run lint --workspace server && npm run build --workspace server`

- [ ] **m72-03 — agent services and chat persistence.** Introduce domain
  exceptions for agent sessions, chat storage, workflows, approvals, and
  scheduler execution; replace remaining raw errors in `agent/session.ts`,
  `agent/chat-store.ts`, and `agent/workflows.ts`; preserve causes around SDK,
  SQLite, listener, compaction, and background-job boundaries. Explicitly
  document/test the few listener/background failures that remain best-effort.
  Verify: `cd app && npm test --workspace server -- agent-session.test.ts chat-store.test.ts workflow.test.ts chat-approvals.test.ts scheduler.test.ts && npm run lint --workspace server`

- [ ] **m72-04 — agent web-tool boundary.** Add typed validation, upstream
  HTTP, content, fetch, and MCP lifecycle exceptions in `web-tools-mcp.ts` and
  registration errors in `web-tools-registration.ts`; return safe MCP tool
  messages while logging full causes to stderr. No stdout logging and no fetched
  content or secrets in exception metadata.
  Verify: `cd app && npm test --workspace server -- web-tools-mcp.test.ts web-tools-registration.test.ts errors.test.ts && npm run lint --workspace server && npm run build --workspace server`

- [ ] **m72-05 — configuration, auth, providers, and CLI.** Complete named
  hierarchies for configuration/security, owner auth state, TOTP decoding,
  provider snapshots/provisioning/connectivity/model listing, and CLI entry
  points. Internally retain network/process/parse/decryption causes before
  mapping expected provider/CLI output; never expose provider keys. Replace the
  remaining raw throws in these areas.
  Verify: `cd app && npm test --workspace server -- config.test.ts secret-permissions.test.ts owner.test.ts totp.test.ts provider-provisioning.test.ts provider-snapshot.test.ts provider-test.test.ts list-models.test.ts encrypt-secret.test.ts reset-invalidation.test.ts && npm run lint --workspace server`

- [ ] **m72-06 — database, stores, and cache transactions.** Add persistence
  exceptions around core/sidecar database opening and domain stores; migrate
  search-index/link-graph transactions so rollback cannot hide the original
  cause; make corrupt persisted JSON either a typed failure or an explicitly
  logged, tested recovery. Keep rebuildable-cache failures best-effort only at
  their documented outer boundary.
  Verify: `cd app && npm test --workspace server -- db.test.ts migrations.test.ts provider-store.test.ts chat-store.test.ts reports-store.test.ts profile-store.test.ts search-index.test.ts search-rebuild.test.ts explorer-graph.test.ts && npm run lint --workspace server`

- [ ] **m72-07 — vault process and lifecycle boundaries.** Introduce vault
  Git/sync/health/commit exceptions with `operation`/`stage` context. Preserve
  child-process spawn, timeout, filesystem, and database causes; keep expected
  states such as not-configured, remote-mismatch, lock contention, or health
  issues as explicit results. Do not expose credential-bearing command/env
  values.
  Verify: `cd app && npm test --workspace server -- git-runner.test.ts git-status.test.ts vault-clone.test.ts vault-health.test.ts vault-review.test.ts commit-loop.test.ts vault-lock.test.ts && npm run lint --workspace server`

- [ ] **m72-08 — files, reports, search, explorer, and backup.** Complete typed
  attachment/upload/path/report/search/explorer/backup boundaries; retain
  `stat`, `realpath`, stream, scan, and filesystem causes when translating them.
  Preserve existing traversal/symlink protections and current public status
  semantics.
  Verify: `cd app && npm test --workspace server -- upload.test.ts upload-metadata.test.ts chat-uploads.test.ts reports-api.test.ts search-api.test.ts search-rebuild.test.ts explorer-api.test.ts backup-api.test.ts && npm run lint --workspace server`

- [ ] **m72-09 — central HTTP exception mapping.** Add one Fastify exception
  mapper that converts typed domain exceptions into backward-compatible safe
  responses (`error`, stable `code`, `requestId`) and appropriate status codes,
  while logging the complete chain once. Remove route-local catch/translation
  duplication where it is not intentional control flow; prove credentials,
  cookies, prompts, and internal stacks never reach responses.
  Verify: `cd app && npm test --workspace server -- structured-logs.test.ts smoke.test.ts auth-flow.test.ts chat-api.test.ts provider-api.test.ts vault-status-api.test.ts reports-api.test.ts search-api.test.ts follow-ups-api.test.ts && npm run lint --workspace server`

- [ ] **m72-10 — browser exception foundation.** Add a browser-owned
  `WebError` hierarchy (`ApiError`, `NetworkError`, `ResponseParseError`,
  `StreamError`) using `error-extender` and a shared fetch/response helper that
  reconstructs server `code`/`requestId`, chains transport/parse failures, and
  supplies safe display messages. Migrate app bootstrap, login, and chat/SSE
  first without changing visible behavior.
  Verify: `cd app && npm test --workspace web && npm run lint --workspace web && npm run build --workspace web`

- [ ] **m72-11 — browser screen boundaries and swallowed rejections.** Migrate
  remaining screens/actions to the shared browser exceptions; replace important
  `.catch(() => {})`/`console.error` paths with visible error state or a named,
  tested best-effort handler. Preserve cancellation/unmount behavior and avoid
  duplicate user messages.
  Verify: `cd app && npm test --workspace web && npm run lint --workspace web && npm run build --workspace web && npx playwright test`

- [ ] **m72-12 — enforcement and deliverable.** Add a guard test preventing
  new raw `throw new Error(...)` in application source (documented deliberate
  exclusions only), assert representative multi-layer `Caused by:` stacks,
  safe HTTP/log serialization, stable codes, and no unhandled rejections. Run
  the full gate, archive this checklist, move the BACKLOG item to Completed,
  and return STATUS to no active milestone.
  Verify: `cd app && npm run lint && npm test && npm run build && npx playwright test`
