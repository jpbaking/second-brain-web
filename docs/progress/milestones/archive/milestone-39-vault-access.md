# Milestone 39 — Agent vault access (correct working directory)

Principal direction: fix the reason the secretary is slow and unhelpful on any
vault question — the `claude-code` chat agent runs in the server's working
directory (`/app`) instead of the vault checkout at
`<SECOND_BRAIN_WEB_DATA_DIR>/workspaces/second-brain`, so it cannot read or
write the vault. The vault itself is present and healthy (not a mount problem);
only the agent's working directory is wrong. Full diagnosis: BACKLOG
Improvements (top item) and the 2026-07-11 journal entries.

Goal: a fresh chat can read the vault — asked to `ls` its working directory it
lists the vault's top-level dirs (`inbox library memory reports scripts`), not
`/app` (`node_modules server web`).

- [x] **m39-01 — Spike: find the cwd mechanism, decide the approach**
  - Determine, from `@cline/core` / `@cline/llms`, exactly how the `claude-code`
    provider's tool/subprocess working directory is resolved, and what our
    `ClineAgentRunner.start()` path currently passes. Known so far: `config.cwd`
    is required by `core.start()` but does not redirect the claude-code
    subprocess; `config.workspaceRoot` had no effect; `ClineCoreOptions` has no
    `cwd`. Identify the real lever (e.g. `prepare()` hook, a provider option,
    `ClineCore.create` cwd, or the runtime spawn cwd) and choose the fix.
  - Verify: findings + chosen approach appended to `journal.md` with concrete
    `file:line` evidence from `node_modules/@cline/*`; no product code yet.

- [x] **m39-02 — Implement the fix + unit coverage**
  - m39-01 found the only reachable lever is `process.cwd()` (the claude-code
    subprocess inherits it; the SDK exposes no per-call cwd we can set). So
    `enterVaultCwd(dataDir)` `process.chdir`s into the vault on the first agent
    start (`cline-runner.ts` `ensureCore`) — relaxing this item's original
    "no chdir" note. Safe: the server addresses everything else by absolute
    path, and the chdir runs only once the vault exists.
  - Unit test `test/cline-runner-cwd.test.ts` proves it chdirs when the vault
    exists and is a no-op otherwise.
  - Verify: `cd app && npm run build && npm test --workspace server -- agent-runner.test.ts agent-session.test.ts cline-runner-cwd.test.ts` → 25 green.

- [x] **m39-03 — Live end-to-end on a rebuilt container**
  - Rebuild the stack and drive a real chat: ask the agent to `ls` its working
    directory and confirm it lists the vault dirs (`inbox library memory
    reports scripts`), not `/app`; then confirm a vault question resolves from
    `memory/`.
  - Verify: `cd .. && ./compose-helper.sh rebuild` then a documented chat probe
    (record the assistant's directory listing in the journal / a screenshot).

- [x] **m39-04 — Full regression, lint, docs**
  - Whole suite green; resolved the item in BACKLOG and STATUS. (A separate
    `repair:` first cleared pre-existing m37/m38 lint debt so `npm run lint`
    passes.)
  - Verify: `cd app && npm run lint && npm test && npm run build` → lint clean,
    331 tests green, build green.
