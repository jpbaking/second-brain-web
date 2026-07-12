# Journal — append-only work log

Older entries (project start → 2026-07-12, milestones 0–49) are preserved
verbatim in `journal-archive-2026-07.md`. Same rules apply here: append only,
never edit or delete past entries.

## 2026-07-12 — journal rotated (2nd)
Entries for milestones 50–65 (2026-07-12 morning/afternoon) moved verbatim to `journal-archive-2026-07.md` at the principal's request.

## 2026-07-12 15:08 — session start
Tree clean at 16cbe12. Principal directed: revamp /explorer into a simple
read-only vault file browser (rendered md preview; graph dropped). Opened
milestone 66.
- 15:14 STARTED progress: milestone 66 checklist + STATUS pointed at m66-01.
- 15:16 STARTED m66-01: replace /api/explorer routes with file-browser tree+file endpoints, rewrite explorer-api.test.ts.
- 15:13 DONE m66-01: verified by `npm test --workspace server -- explorer-api.test.ts` → 9 tests green; lint clean.
- 15:13 STARTED m66-02: rewrite ExplorerScreen as file browser (breadcrumbs, listing, md preview).
- 15:15 DONE m66-02: ExplorerScreen rewritten as file browser; verified by `npm run lint && npm run build` → clean.
- 15:15 STARTED m66-03: full verify (lint+test+build) + screenshot + archive.
- 15:20 DONE m66-03: full suite 384 green, lint+build clean; new Playwright e2e explorer.spec.ts passes (login → browse memory/notes → rendered md preview, screenshot reviewed). Checklist archived.

## 2026-07-12 15:20 — session end
Milestone 66 complete and archived. /explorer is a read-only vault file browser with rendered md preview; e2e spec added. Handoff: no active milestone; rebuild pending for 62–66.

## 2026-07-12 15:35 — session start
Tree clean at 4d95d1f. Principal directed: amber "Secretary" label in chat. Opened milestone 67.
- 15:35 DONE m67-01: .chat-msg-author now var(--accent-amber); lint+build clean; Playwright screenshot shows amber SECRETARY (rgb(217,130,31)). Temp spec removed. Checklist archived.

## 2026-07-12 15:35 — session start
Tree clean at 4d95d1f. Principal directed: amber "Secretary" label in chat. Opened milestone 67.
- 15:35 DONE m67-01: .chat-msg-author now var(--accent-amber); lint+build clean; Playwright screenshot shows amber SECRETARY (rgb(217,130,31)). Temp spec removed. Checklist archived.

## 2026-07-12 15:38 — session start
Tree clean at 55c164e. Principal directed: hover download icon on /explorer rows. Opened milestone 68.
- 15:38 STARTED m68-01: /api/explorer/download endpoint + tests.
- 15:39 DONE m68-01: verified by `npm test --workspace server -- explorer-api.test.ts` → 10 green.
- 15:39 STARTED m68-02: hover download icon on file rows + e2e.
- 15:41 DONE m68-02: verified by lint+build clean and `npx playwright test explorer.spec.ts` → download asserted (welcome.md), hover screenshot reviewed. Checklist archived.

## 2026-07-12 15:43 — session start
Tree clean at b5adf86. Principal directed: copyright footer on all pages except chat. Opened milestone 69.
- 15:43 STARTED m69-01: AppFooter component + shell/login/setup wiring + e2e.
- 15:45 DONE m69-01: verified by lint+build clean, full `npx playwright test` → 3 green (footer on login+explorer, none on chat), screenshot reviewed. Checklist archived.

## 2026-07-12 15:47 — session start
Tree clean at 42772a4. Principal request: trim progress files.
- 15:47 DONE trim: STATUS 132→55 lines (Previous tail collapsed into Where-we-are), journal rotated again (274→43 lines; milestones 50–65 entries moved verbatim to journal-archive-2026-07.md). BACKLOG (77 lines) and milestone archives untouched (read-only).

## 2026-07-12 15:50 — session start
Tree clean at ddad165. Principal: footer forces scroll on short pages; ensure /capture footer. Opened milestone 70.
- 15:50 STARTED m70-01: flex layout so page+footer share one viewport.
- 15:54 DONE m70-01: page+footer share one viewport (.app-page flexes, footer absorbs bottom padding); verified by lint+build clean, `npx playwright test` → 3 green with no-scroll asserts on /login, /explorer, /capture; capture screenshot reviewed. Checklist archived.

## 2026-07-13 01:00 — session start
Tree clean at 693ea1d. Principal directed Java-style exception cause chains via
`error-extender` and `log4js` runtime logging with an `.env`-configurable root
level. Baseline `npm test` is clean: 78 server files / 385 tests and 1 web file
/ 9 tests. Opened milestone 71.
- 01:00 STARTED progress: milestone 71 checklist + STATUS pointed at m71-01.
- 01:01 STARTED m71-01: add log4js foundation, safe structured HTTP logs, and
  SECOND_BRAIN_WEB_LOG_LEVEL configure/compose/env wiring.
- 01:05 DONE m71-01: log4js emits safe structured HTTP JSON; root level is
  validated/configurable through configure, compose, and `.env.example`;
  verified by the targeted 22 tests and full workspace lint clean.
- 01:06 STARTED m71-02: migrate custom errors to one error-extender hierarchy,
  retain causes at wrapping boundaries, and replace runtime console failures
  with categorised log4js records.
- 01:10 DONE m71-02: all 13 custom server exception types now inherit AppError;
  wrapper boundaries retain `cause`, and startup/scheduler/session/MCP failures
  use named log4js categories (MCP logs stay on stderr); verified by 9 targeted
  files / 56 tests, workspace lint clean, and server TypeScript build clean.
- 01:11 STARTED m71-03: document the operator log-level setting, run the full
  gate, and archive milestone 71.
- 01:13 DONE m71-03: README documents log levels and JSON output; full gate is
  clean (`npm run lint && npm test && npm run build`) — 79 server files / 390
  tests, 1 web file / 9 tests, both builds. Real log4js probe at root `warn`
  emitted only the warn record as valid JSON. Checklist archived.

## 2026-07-13 01:13 — session end
Milestone 71 complete and archived. Handoff: no active milestone; rebuild is
pending for milestones 62–71.

## 2026-07-13 01:28 — session start
Tree clean at e76e942. Principal directed a milestone plan before any further
exception work. Audit baseline: 30 raw `throw new Error` sites across 12 server
files, 15 existing error-extender constructors, and 70 browser `.catch` handlers
across 18 files.
- 01:28 DONE progress: wrote milestone 72's 12-item repository-wide exception
  boundary checklist, pointed STATUS at m72-01, and added the active BACKLOG
  entry. No application code changed.

## 2026-07-13 01:28 — session end
Milestone 72 is planned but implementation has not started. Handoff: begin
m72-01 only when the principal directs implementation.

## 2026-07-13 01:31 — session start
Tree clean at 7f67bec. Active: milestone 72, next item: m72-01. Principal
directed implementation. Baseline `errors.test.ts agent-runner.test.ts` is
clean: 2 files / 15 tests.
- 01:31 STARTED m72-01: add reusable safe exception metadata/wrapping helpers
  and make runner.ts expose AgentRunnerError for its deliberate failures.
- 01:32 DONE m72-01: added runtime-allow-listed SafeErrorData, cause-preserving
  wrapError, and AgentRunnerError for unsupported provider resolution;
  verified by 2 files / 17 tests, server lint, and server build clean.
- 01:33 STARTED m72-02: add the ClineAgentRunnerError boundary and injectable
  SDK seam for deterministic operation/stage/cause tests without a live model.
- 01:35 DONE m72-02: Cline initialisation stages and start/send/subscribe/
  unsubscribe/read/stop now throw ClineAgentRunnerError with safe context and
  chained causes; verified by 3 files / 12 tests, server lint, and server build.

## 2026-07-13 01:35 — session end
m72-01 committed as 7b3cecf and m72-02 as b16d102. Tree clean; milestone 72
remains active. Handoff: begin m72-03 with agent/session.ts, chat-store.ts,
workflows, approvals, and scheduler only.

## 2026-07-13 01:41 — session start
Tree clean at d9465f6. Active: milestone 72. Principal added Cline SDK debug
logging and provider request/response tracing before m72-03.
- 01:41 DONE progress: inserted m72-02a with explicit trace-level redaction and
  deterministic verification requirements; STATUS now points to it. No
  application code changed yet.
- 01:42 STARTED m72-02a: bridge Cline BasicLogger to log4js and trace sanitized
  provider fetch request/response metadata without bodies, headers, or queries.
- 01:45 DONE m72-02a: `cline.sdk` maps BasicLogger debug/operational levels and
  `cline.provider` traces sanitized fetch start/response/failure metadata;
  query/header/body/content/error details are excluded. Verified by 3 files /
  11 tests, server lint, and server build clean.

## 2026-07-13 01:45 — session end
m72-02a committed as acc723c. Tree clean; milestone 72 remains active.
Handoff: begin m72-03 (agent services and chat persistence).

## 2026-07-13 01:47 — session start
Tree clean at 2cd498b. Principal request (outside milestone): demote vault write-lock poll HTTP logs to debug.
- 01:48 STARTED repair: log GET /api/vault/lock request received/completed at debug — chat lock polling too noisy at info.
- 01:51 DONE repair: verified by `npm run lint` + `npm test` (server 399 green, web 9 green).
- 01:56 STARTED repair: configure CLI — numbered select for provider, log level, and node env instead of free-typed input.
- 01:59 DONE repair: configure CLI numbered selects; verified by piped end-to-end run (runtime + add provider + save) and `npm test` server suite 399 green.

## 2026-07-13 01:59 — session start
Tree clean at 385832f. Principal directed new work: ChatGPT subscription
provider support (backlog + implementation). Milestone 72 paused at m72-03.
- 02:00 STARTED progress: research SDK support, write BACKLOG entry and
  milestone 73 checklist, point STATUS at it.
- 02:04 DONE progress: BACKLOG entry, milestone-73-chatgpt-provider.md
  checklist (6 items with design notes), STATUS points at m73-01;
  milestone 72 paused at m72-03.
- 02:05 STARTED m73-01: add chatgpt provider id plumbing (known providers,
  SDK id map, catalog map, provisioning rules).
- 02:07 DONE m73-01: chatgpt known-provider + id maps + provisioning
  base_url rejection; verified by 3 test files / 37 tests green. 
- 02:08 STARTED m73-02: parse chatgpt OAuth blob in toModelConfig and emit
  SDK providerConfig accessToken/refreshToken/accountId.
- 02:10 DONE m73-02: parseChatGptCredentials + providerConfig OAuth mapping
  in toModelConfig; verified by agent-runner.test.ts 16 green + lint clean.
- 02:11 STARTED m73-03: refresh chatgpt OAuth credentials at session start
  and persist rotated blobs to the profile secret.
- 02:14 DONE m73-03: freshenChatGptProfileSecret refreshes via injectable
  getValidOpenAICodexCredentials, persists rotated blobs (rotateProfileSecret),
  hooked into ensureLive for chatgpt profiles; verified by chatgpt-auth.test.ts
  6 green + full server suite 410 green + lint clean.
- 02:15 STARTED m73-04: configure CLI chatgpt OAuth login (loginOpenAICodex
  with manual-code fallback) + catalog model pick + encrypted blob save.
- 02:21 DONE m73-04: configure adds/edits chatgpt via loginOpenAICodex (URL +
  manual code fallback), catalog model picker (gpt-5.5 family), encrypted
  blob into providers.yaml. Verified by scripted runs (menu [OAuth] label,
  catalog model switch, abandoned login leaves state untouched) + server
  suite 410 green ×2 + lint + build. Full live login deferred to m73-06.
- 02:22 STARTED m73-05: web /providers page rendering for chatgpt profiles
  (OAuth badge, no key controls).
- 02:28 DONE m73-05: /providers shows "OAuth login" for chatgpt profiles and
  the test endpoint validates the stored blob offline. Verified by
  provider-test.test.ts 12 green, lint, web build, and a headless-Chromium
  harness (login → /providers screenshot + API test → "ChatGPT login present
  and current."). 
- 02:29 STARTED m73-06: document the chatgpt provider; live verification
  needs the principal's ChatGPT login.
- 02:33 DONE m73-06 (docs half): README documents the chatgpt provider and
  its configure login flow.
- 02:33 BLOCKED m73-06 (live half): a real chat turn needs the principal's
  ChatGPT account — the OAuth exchange cannot be completed by the agent.
  Everything else is verified: unit suites, scripted configure runs, and a
  headless-browser /providers check. Question added to STATUS.

## 2026-07-13 02:34 — session end
Milestone 73 items 01–05 committed; m73-06 docs committed, live check
blocked on the principal's ChatGPT login. Milestone 72 paused at m72-03.
Handoff: after the principal confirms a live turn, tick m73-06, archive the
checklist, update BACKLOG, and resume milestone 72.
