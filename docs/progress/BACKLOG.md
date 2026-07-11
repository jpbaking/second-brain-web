# BACKLOG — the only queue of future work

Nothing here is in progress. **Do not start an item without the principal
saying go.** When the principal picks one, create a milestone checklist for it
in `docs/progress/milestones/` (numbered after the last archived milestone)
and follow AGENTS-PLAYBOOK.md. Completed checklists move to
`docs/progress/milestones/archive/`.

## Larger features (from the phase-008 backlog — need principal scoping)

See `docs/project-plan/phase-008-feature-backlog-and-design-hooks.md` for other larger features.

## Improvements

- ~~**Agent runs in `/app`, not the vault — it cannot read/write the vault**~~
  — completed in milestone 39. The claude-code agent inherits `process.cwd()`
  and the SDK exposes no reachable per-call cwd, so `enterVaultCwd()`
  (`cline-runner.ts`) `process.chdir`s into the vault checkout on first agent
  start. Live-verified: a fresh chat lists the vault folders and reads
  `README.md`. Archived checklist: `milestones/archive/milestone-39-vault-access.md`.
  - **Symptom (principal-reported, 2026-07-11):** asked "who's my employer?",
    the agent spends a long time then reports it has "zero read access to your
    vault" and can only see the app's own source. Slow turns on vault questions
    trace to this, not (only) the streaming issue.
  - **Confirmed:** a fresh chat asked to `ls` its working directory replies
    `node_modules / server / web` — i.e. **`/app`** (the server's cwd), not the
    vault. The vault itself is present and healthy at
    `<SECOND_BRAIN_WEB_DATA_DIR>/workspaces/second-brain` (full `inbox/`,
    `library/`, `memory/`, `reports/`, `scripts/`, git history incl. the CV
    ingest). So this is **not** a missing mount — the agent's working directory
    is simply wrong. (The agent's own "should be mounted" guess is off: data is
    there; cwd isn't pointed at it.)
  - **Investigation (evidenced, then reverted — do not re-try blindly):**
    - The app already sets `config.cwd = vaultWorkspacePath(dataDir)`
      (`app/server/src/agent/session.ts:400`) and passes it through
      `ClineAgentRunner.start()`. It has no effect on the `claude-code`
      provider's working directory.
    - The SDK's `CoreSessionConfig` (`@cline/core`) exposes `workspaceRoot`, not
      `cwd`. Setting `config.workspaceRoot = vaultCwd` **also had no effect**
      (agent still in `/app`). **Removing** `config.cwd` makes `core.start()`
      throw → `POST /messages` 502s in ~30 ms. So `cwd` is required by the SDK
      yet does not redirect the claude-code subprocess.
    - `ClineCoreOptions` (passed to `ClineCore.create`, `cline-runner.ts:25`)
      has no `cwd`; we use `backendMode: 'local'`. The claude-code subprocess
      appears to inherit the server process cwd (`/app`, `PWD=/app`).
  - **Fix direction / open questions (needs SDK-internals work before a
    checklist):**
    - Determine how `@cline/core` + `@cline/llms` set the **claude-code
      provider subprocess cwd** in this version (candidates seen in the bundled
      code: `this.options.cwd`, a `prepare(input)` hook on `ClineCoreOptions`,
      or `hub?.cwd`). None is wired from our side today.
    - Candidate fixes to try (verify each with the `ls` probe under an
      auto-approve preset): supply cwd through a supported create/start channel;
      use the `prepare()` hook to set workspace-scoped state; or launch the SDK
      runtime with cwd = vault. Avoid `process.chdir()` in the server.
    - Check whether non-`claude-code` providers (native `gemini`, etc.) honour
      `config.cwd` — the tool sandbox / cwd handling may be provider-specific.
  - **Verification:** a fresh chat asked to `ls` lists the vault's top-level
    dirs (`inbox library memory reports scripts`), not `/app`
    (`node_modules server web`); "who's my employer?" resolves from `memory/`.

- ~~**Stream chat replies live; stop blocking `/messages` on the whole turn**~~
  (completed in milestone 40). Today a chat turn does not stream and the POST
  hangs for the turn's full duration, which 504s behind any reverse proxy with
  a normal read timeout.
  - **Symptom (principal-reported, 2026-07-11):** chatting via the
    `assistant.int.bakings.net` proxy sticks on "Processing…"; the `/messages`
    POST stays pending and eventually 504s; no events arrive.
  - **Root cause (two server-side facts, evidenced):**
    1. `POST /api/chat/sessions/:id/messages` does `await sendMessage()` →
       `await ensureLive()` → `await runner.start()`, and `@cline/core`
       `core.start()` only resolves when the *turn completes*. Measured: one
       POST returned `202` after `10,878 ms` for a ~10 s reply.
    2. In `ensureLive` (`app/server/src/agent/session.ts:427-448`) the
       sdk-session→chat-session mapping (`setSdkSessionId` / `live.set`) is only
       set *after* `start()` resolves. While the turn runs, every SDK event has
       an unmapped sdkSessionId, so `handleSdkEvent` buffers it in
       `earlyEvents` and fans out **nothing** to `/events` until the turn ends.
       Confirmed from `chat_events` timestamps: `user_message` at `:47.314`,
       then a 10 s gap, then all `agent_event`/`chunk` rows appended in one
       ~0.4 s burst at `:57.756`.
  - **Impact:** turns under the proxy read timeout "work" but arrive batched at
    the end (never token-by-token); turns over it 504 and the client is stuck
    on "Processing…". True SSE streaming has effectively never worked end to
    end — the proxy cannot stream what the server withholds until turn end.
  - **Interim mitigation (already applied by principal):** raised
    nginx-proxy-manager `proxy_read_timeout`/`proxy_send_timeout` and set
    `proxy_buffering off` on the host's Advanced config. This stops the 504 and
    lets the (still batched) reply land; it does not make replies stream.
  - **Proper fix — direction (needs investigation before checklisting):**
    - Establish the sdk-session→chat-session binding *before* the turn finishes
      so events fan out live. Open question: can `core.start()` surface the
      session id early (callback / returned handle), or must we bind on the
      first inbound event for a "just-started" chat session? Single-user app,
      so a one-at-a-time "pending start" association is likely acceptable but
      must be race-safe.
    - Make the `/messages` handler return `202` as soon as the turn is kicked
      off (don't `await` the whole turn); keep all output on `/events`.
    - Re-verify the dependent flows that ride the same path: tool-approval
      round-trips (`requestToolApproval`), manual/auto compaction detection
      (which re-reads `chat_events`), and the `pending`/`isLive` processing
      indicator added on 2026-07-11.
  - **Verification:** a long (>60 s) turn no longer 504s; `/messages` returns
    <1 s; `/events` delivers `chunk`s incrementally over the turn (assert via
    timestamp spread through the proxy, not just final text); existing server
    suite + a scripted-runner e2e stay green.

- Deterministic e2e for the chat processing indicator. The current e2e login
  spec (`test/e2e/login.spec.ts`) fails against the fresh in-process harness
  because the onboarding gate ("No providers configured") intercepts the chat
  welcome — it predates the gate and does not stub `/api/providers` (the vault
  spec does). Seed a provider in `global-setup.ts` (or stub it) and add a
  scripted-runner spec that drives send → asserts `.chat-processing` shows,
  then a scripted `ended` hides it and folds cumulative chunks without
  duplication. Verified live for now via a throwaway container-driven spec.

- ~~Claude Code subscription provider~~ — completed in milestone 36: Cline SDK
  `claude-code` inference, container-local manual auth, configurator reminder.

- ~~Fix layout and theme compliance issues across feature screens~~ — picked up in milestone 35.
  - ~~`ProfileScreen.tsx`: Needs complete rewrite. It uses Tailwind-style utility classes instead of the required `app-page`/`app-hero`/`action-card` pattern, lacks the standard `alert` classes, and does not properly use form elements.~~
  - ~~`SchedulesScreen.tsx`: Uses incorrect form classes (`form-group`, `text-input`, `select-input`), references non-existent CSS variables (`--surface-sunken`, `--text-muted`), and uses heavy inline styles.~~
  - ~~`MeetingPrepScreen.tsx`: Form fields incorrectly use `form-group`/`form-label`/`form-input` instead of the kit's `field`/`label`/`input` pattern.~~
  - ~~`FollowUpsScreen.tsx`: Uses custom tab classes instead of the kit's `.tab-list`/`.tab`/`.tab.active` pattern, and uses an undefined `.btn-ghost` class (should be `.btn-quiet`).~~
  - ~~`ExplorerScreen.tsx`: Uses undefined `.btn-ghost` class (should be `.btn-quiet`).~~

- ~~Port `configure.ps1` to match the bash `configure` revamp~~ — completed in
  milestone 32, together with a filter+pager model picker added to both scripts.
  (PowerShell execution smoke-test on Windows is the principal's to run — no
  pwsh on the Linux dev host; ported by structured parity review.)

- ~~Onboarding / State checks on login:~~ (completed in milestone 30)
  - ~~If no providers have been configured, show an info/error page (only "Sign Out" allowed in navigation).~~
  - ~~If a provider is configured but there is no vault, land the user in vault config and restrict navigation to only that and "Sign Out".~~

## Nice-to-have (do not pick up automatically)

- Voice capture
- Semantic search (embeddings)

## Dropped / resolved (kept for the record)

- ~~Rich diff review~~ — completed in milestone 28. Added partial commit endpoints and an interactive Review Commit Modal with semantic grouping and previews.
- ~~Principal Profile~~ — completed in milestone 27. Added persistent settings area for principal-directed preferences like report styles, timezone, and work week configuration.
- ~~Scheduled Briefs~~ — completed in milestone 26. Added background `SchedulerService`, `scheduled_jobs` SQLite table, `/api/schedules` CRUD endpoint, and `SchedulesScreen` UI.
- ~~Backup/Restore UI~~ — completed in milestone 25. Added `/api/backup/core` and `/api/backup/sidecar` to serve database snapshots, and created a dedicated `BackupScreen` in the UI to download them safely.
- ~~Meeting Prep Mode~~ — completed in milestone 24. Added `/api/chat/workflows/prep` and a dedicated frontend screen to kick off parameterized workflow sessions.
- ~~Automatic context compaction triggers~~ — completed in milestone 22. Triggers 
  compaction based on character count threshold at the end of agent turns.
- ~~Declarative provider provisioning (YAML-only)~~ — completed in milestone 15.
  `providers.yaml` (pre-encrypted keys) is the sole provider source; CRUD
  removed (read-only + Test stays); `configure`/`configure.ps1` scripts;
  compose bind-mount.
- ~~Run bare-metal production under a dedicated system user~~ — completed in
  milestone 21 with a validated, home-isolated systemd unit and documented
  install/bootstrap/upgrade flow. Containers remain isolated by `USER node`.
- ~~Strip inline source-link Markdown from follow-up display text~~ — completed
  in milestone 20. Raw parser/API text remains canonical; the UI shows clean
  text and the resolved source separately.
- ~~Slim the Docker image by excluding web runtime dependencies~~ — completed
  in milestone 19. The server-scoped install excludes React/ReactDOM and saves
  8 MiB uncompressed (Docker display 1.28 GB → 1.27 GB; compressed image size
  283,660,007 → 282,335,443 bytes). Cline's production tree remains dominant.
- ~~Expose the native `gemini` provider~~ — completed in milestone 18: SDK
  mapping, provider API, connectivity Test action, and settings selector.
- ~~Encrypt the TOTP secret at rest~~ — completed in milestone 17. New owner
  state is encrypted with `SECOND_BRAIN_WEB_SECRETS_KEY`; legacy plaintext
  state migrates safely on first authenticated read.
- ~~`reset-auth` should also revoke active DB sessions~~ — already implemented
  in milestone 2: the CLI calls `invalidateSessionsAndChallenges`, which
  revokes every active DB session and deletes pending login challenges.
- ~~SDK session artifacts under `~/.cline/data/sessions/`~~ — resolved in
  milestone 5A: `CLINE_DATA_DIR` points at `<dataDir>/sessions`.
- ~~`spike/test-vault/` cleanup note~~ — `spike/` was deleted in milestone 14.
- ~~Top-nav density~~ — resolved by the milestone 16 sidebar shell.
