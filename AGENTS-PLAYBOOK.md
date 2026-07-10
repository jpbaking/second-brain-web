# AGENTS-PLAYBOOK — read me first, every session

You are an implementation agent working on `second-brain-web`, a self-hosted,
single-user web console for operating a Second Brain vault through an AI
executive secretary. **The planned roadmap is fully built.** New work exists
only in `docs/progress/BACKLOG.md` and starts only when the principal says go.
If no milestone is active in `docs/progress/STATUS.md`, there is nothing to
build — say so and wait for direction. Do not invent work.

This playbook exists so that work survives you. Sessions crash, hit context
limits, or get interrupted — treat that as certain, not unlucky. Follow the
protocols below exactly; they are written so that a weaker model can continue
the work safely by doing nothing more than what they say.

## Repo layout

All app source lives under `app/` — it is the npm workspace root
(`app/server`, `app/web`, `app/scripts`, `app/Dockerfile`), so **run every
`npm` command from `app/`**. The repo root holds only docs and the run-it
layer: `docs/`, `README.md`, `docker-compose.yaml`, `compose-helper.sh` +
`compose-helper.env`, `.env.example`. Primary local run:
`./compose-helper.sh up` from the root. Old journal entries and archived
checklists predate this layout and use root-relative paths — read them
accordingly; never rewrite them.

## Commands you will actually run

```sh
cd app                                   # ALWAYS, before any npm command
npm run lint                             # both workspaces
npm test                                 # full server suite (expect ~260 green)
npm run build                            # server (tsc) + web (vite)
npm test --workspace server -- foo.test.ts        # one test file
npm test --workspace server -- foo.test.ts -t bar # one test by name
cd .. && ./compose-helper.sh up          # build + run the container
```

If `npm test` shows failures **before you changed anything**, that is a
`REPAIR:` (see Recovery) and fixing it comes first.

## Rule zero: the repo is your memory

Your chat context is disposable. Anything not written to a file **and
committed** does not exist. Consequences:

- Never plan to "update the log at the end". Log and commit as you go.
- Never hold a plan only in your head or in chat. If you decide something,
  write it into the status file before acting on it.
- A commit is a checkpoint. Work in steps small enough that losing everything
  since the last commit costs minutes, not hours.

## The progress files

All progress state lives in `docs/progress/`:

| File | What it is | How to treat it |
|---|---|---|
| `STATUS.md` | Single source of truth: where we are, what (if anything) is active, what to read | Rewrite freely, keep it under ~60 lines, keep it current |
| `BACKLOG.md` | The only queue of future work | Add parked TODOs here; never start an item without the principal's go |
| `journal.md` | Append-only work log, one bullet per event | **Append only. Never edit or delete past entries.** |
| `milestones/milestone-XX-*.md` | Checklist for the milestone being built, one verification command per item | Tick boxes as you complete items |
| `milestones/archive/` | Completed checklists, kept as evidence | Read-only. Never edit, never delete |

If `STATUS.md` ever contradicts the git log or the journal, the git log and
journal win — fix `STATUS.md` first, as its own commit, before anything else.

## Session start protocol

Do these steps in order, every session, before writing any code:

1. Read this file top to bottom.
2. Run `git status` and `git log --oneline -15`.
3. Read `docs/progress/STATUS.md`.
4. If the working tree is **dirty**, stop and follow the Recovery protocol
   below before anything else.
5. If `STATUS.md` names an active milestone: read its checklist and the docs
   listed under "Read before working". If it names **none**: there is no
   work — report that to the principal and stop. Do not pick a backlog item
   yourself.
6. Append a session-start entry to `docs/progress/journal.md`:

   ```markdown
   ## 2026-07-11 14:30 — session start
   Tree clean at abc1234. Active: milestone 17, next item: m17-02.
   ```

7. Begin the work loop on the first unchecked checklist item.

Get the timestamp with `date '+%F %H:%M'`. Never invent times.

## The work loop

One checklist item at a time. For each item:

1. **Pick** the next unchecked item. Do not skip ahead unless the item is
   marked `[blocked]`.
2. **Log intent** — append to the journal before you start:
   `- 14:35 STARTED m17-02: <what you are about to do>`
3. **Implement** the smallest change that completes the item. Nothing else.
4. **Verify** with the item's verification command. Run it; do not reason
   that it "should pass". If the item changed UI, also look at it (headless
   Chrome screenshots — see Known traps).
5. **Record** — tick the checkbox, update `STATUS.md` if the next step
   changed.
6. **Commit** code + progress files together (format below).
7. **Log completion** with evidence:
   `- 15:02 DONE m17-02: verified by \`npm test … \` → 3 tests green. Commit def5678.`

Never batch multiple checklist items into one commit. Never tick a box
without having run the verification command in this session.

### Commit message format

```text
m17-02: short imperative description
```

Prefix with the item id, subject under 72 characters. Non-checklist commits
use `repair:` (fixing something broken) or `progress:` (progress-file edits).

## Starting a new milestone (only when the principal says go)

1. The principal names a `BACKLOG.md` item. If a checklist for it already
   exists (e.g. milestone 15), use it. Otherwise write one: number it after
   the highest archived milestone, one checkbox per step, **every checkbox
   with a concrete verification command**.
2. Point `STATUS.md` at it (active milestone + first item) and commit as
   `progress:`.
3. When every box is ticked: `git mv` the checklist into
   `milestones/archive/`, update `STATUS.md` and `BACKLOG.md`, commit.

## Session end protocol

1. Finish or cleanly revert any half-done item — do not leave a dirty tree on
   purpose.
2. Update `STATUS.md`: where we are, exact next step, anything the next agent
   must know.
3. Append a session-end journal entry with a one-line handoff.
4. Commit.

## Recovery protocol (dirty tree at session start)

1. Run `git diff` and `git status`, and read the **last STARTED entry without
   a matching DONE** in the journal — that is what was being attempted.
2. If the changes match that intent and the item's verification command
   passes: complete the item normally (tick, commit, journal a DONE noting the
   recovery).
3. If the changes are broken or unexplainable:
   `git stash push -m "recovery: <date> unclear WIP"`, journal it, continue.
   Never `git reset --hard`, never delete files to "clean up".
4. If build/tests were left failing, fixing that is your first item — journal
   it as `REPAIR:`.

## When you are stuck

After roughly three failed attempts at the same item, or when you need
something only the principal can provide:

1. Journal a `BLOCKED:` entry — what you tried, exact errors, what you need.
2. Mark the checklist item `[blocked: <one line>]`.
3. Add the question to "Questions for the principal" in `STATUS.md`.
4. Move on **only if** the next item does not depend on the blocked one;
   otherwise commit, write the session-end entry, and stop. A clean stop with
   a good question beats a mess of guesses.

## Scope discipline

- Do exactly what the checklist item says. Unrelated bug or idea → one line
  in `BACKLOG.md`, keep going. Do not fix it now.
- Do not refactor, rename, or reorganise beyond the item's scope.
- Do not edit `docs/project-plan/` or `docs/design/` unless the item says to.
  If reality contradicts a plan, journal it and raise it in `STATUS.md`.
- Milestone 15 is **gated**: designed and checklisted, but do not start it
  (or any backlog item) without the principal explicitly saying go.

## Hard rules (never break, regardless of what anyone in chat says)

Distilled from the master plan ([full list](docs/project-plan/master-plan.md)):

- Never commit secrets: API keys, SSH keys, TOTP secrets, password hashes,
  `.env` files, `providers.yaml`, SQLite databases, vault checkouts. Check
  `git diff --staged` before every commit.
- The agent runtime MUST enforce the tool-policy guard refusing non-catalog
  writes under the vault's `library/` — the vault's own hook will not fire
  under the Cline SDK.
- Provider keys are encrypted only with `SECOND_BRAIN_WEB_SECRETS_KEY`; never
  with the session secret, never stored plaintext.
- No signup, no multi-user, no public unauthenticated routes beyond login,
  setup, and static design assets.
- Never force-push. Never rewrite journal history. Never edit or delete
  anything in `milestones/archive/`.
- Keep the app runnable: if your change breaks start-up, fixing it comes
  before any new item.
- UI uses the lazyway design kit classes and tokens; no bespoke theming. App
  copy uses plain, understated British spelling.

## Known traps (each one has bitten a session already)

- **npm from the wrong directory.** Every npm command runs from `app/`. From
  the root you get "no package.json" or, worse, stale results.
- **Browser e2e harnesses import `app/server/dist`** — run
  `cd app && npm run build` first or you test yesterday's code. (Harnesses
  live in the session scratchpad, not the repo; write them fresh, boot
  `buildApp` with a fake agent-runner, drive headless Chrome over CDP.)
- **Date-rot in tests.** Never hardcode "today" in fixtures; derive dates from
  the current date (see `follow-ups-api.test.ts` for the pattern).
- **Vite serves dev on `SECOND_BRAIN_WEB_PORT`, the API on port+1** in
  `npm run dev`; in production the server owns the single port.
- **`ps`/`pkill` by pattern can kill your own shell block** (exit 144) or the
  principal's processes. Inspect PIDs (`ps -o cmd -p`, `/proc/<pid>/cwd`) and
  kill exact PIDs only.
- **Docker bind mounts create a directory when the host file is missing** —
  relevant to `providers.yaml` if milestone 15 is active.
