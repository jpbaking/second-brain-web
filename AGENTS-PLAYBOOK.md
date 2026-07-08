# AGENTS-PLAYBOOK — read me first, every session

You are an implementation agent working on `second-brain-web`, a self-hosted,
single-user web console for operating a Second Brain vault through an AI
executive secretary. The full design lives in `docs/project-plan/` — start
with [master-plan.md](docs/project-plan/master-plan.md) and the
[implementation roadmap](docs/project-plan/phase-006-implementation-roadmap.md).
You do not need to read all ten phase docs every session; the status file
(below) tells you which ones matter right now.

This playbook exists so that work survives you. Sessions crash, hit context
limits, or get interrupted — treat that as certain, not unlucky. Follow the
protocols below exactly and any future agent (or a weaker model) can pick up
where you stopped by reading this one file.

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
| `STATUS.md` | Single source of truth: where we are, the next step, what to read, open questions | Rewrite freely, keep it under ~60 lines, keep it current |
| `journal.md` | Append-only work log, one bullet per event | **Append only. Never edit or delete past entries.** |
| `milestones/milestone-XX-*.md` | One checklist per roadmap milestone, with per-item verification commands | Tick boxes as you complete items; add notes under items |

If `STATUS.md` ever contradicts the git log or the journal, the git log and
journal win — fix `STATUS.md` first, as its own commit, before doing anything
else.

## Session start protocol

Do these steps in order, every session, before writing any code:

1. Read this file top to bottom.
2. Run `git status` and `git log --oneline -15`.
3. Read `docs/progress/STATUS.md`.
4. If the working tree is **dirty**, stop and follow the Recovery protocol
   below before anything else.
5. Read the active milestone checklist in `docs/progress/milestones/`.
6. Read only the plan docs `STATUS.md` lists under "Read before working".
7. Append a session-start entry to `docs/progress/journal.md`:

   ```markdown
   ## 2026-07-08 14:30 — session start
   Tree clean at abc1234. Active: milestone 00, next item: <item id>.
   ```

8. Begin the work loop on the first unchecked checklist item.

Get the timestamp with `date '+%F %H:%M'`. Never invent times.

## The work loop

One checklist item at a time. For each item:

1. **Pick** the next unchecked item in the active milestone checklist. Do not
   skip ahead unless the item is marked `[blocked]`.
2. **Log intent** — append to the journal before you start:
   `- 14:35 STARTED m00-03: <what you are about to do>`
   This line is what lets the next agent understand a half-finished tree.
3. **Implement** the smallest change that completes the item. Nothing else.
4. **Verify** using the item's verification command (every checklist item has
   one). Run it; do not reason that it "should pass".
5. **Record** — tick the checkbox, update `STATUS.md` if the next step or
   reading list changed.
6. **Commit** everything (code + progress files together) with the message
   format below.
7. **Log completion** with evidence:
   `- 15:02 DONE m00-03: verified by \`node spike/resume.mjs\` → session resumed with prior context. Commit def5678.`

Never batch multiple checklist items into one commit. Never tick a box
without having run the verification command in this session.

### Commit message format

```text
m00-03: prove session resume across process restart
```

Prefix with the item id. Keep the subject under 72 characters. If a commit is
a repair or a progress-file fix rather than a checklist item, use `repair:`
or `progress:` as the prefix.

## Session end protocol

If you reach a natural stopping point:

1. Finish or cleanly revert any half-done item — do not leave a dirty tree on
   purpose.
2. Update `STATUS.md`: where we are, exact next step, anything the next agent
   must know.
3. Append a session-end journal entry with a one-line handoff:
   `## 15:40 — session end. Next: m00-04. Note: provider key is expected in SECOND_BRAIN_SPIKE_API_KEY.`
4. Commit.

If your session dies before this, the protocols above mean the loss is one
item at most — that is the point of them.

## Recovery protocol (dirty tree at session start)

A dirty tree means a previous session died mid-item. Do not panic and do not
destroy evidence:

1. Run `git diff` and `git status` and read the **last STARTED entry without
   a matching DONE** in the journal — that tells you what was being
   attempted.
2. If the changes match that intent and the item's verification command
   passes: complete the item normally (tick, commit, journal a DONE noting it
   recovers the previous session's work).
3. If the changes are broken or you cannot tell what they were for:
   `git stash push -m "recovery: <date> unclear WIP"`, journal what you
   stashed and why, and continue from the checklist. Never `git reset --hard`
   and never delete files to "clean up".
4. If the build/tests were left failing by a previous session, fixing that is
   your first item — journal it as `REPAIR:`.

## When you are stuck

After roughly three failed attempts at the same item, or when you need
something only the principal can provide (a credential, a decision, access):

1. Journal a `BLOCKED:` entry — what you tried, exact error messages, what
   you need.
2. Mark the checklist item `[blocked: <one line>]`.
3. Add the question to the "Questions for the principal" section of
   `STATUS.md`.
4. Move to the next item **only if** it does not depend on the blocked one;
   otherwise commit, write the session-end entry, and stop. A clean stop with
   a good question beats a mess of guesses.

## Scope discipline

- Do exactly what the checklist item says. If you notice an unrelated bug or
  improvement, add one line to "Known issues / parked TODOs" in `STATUS.md`
  and keep going. Do not fix it now.
- Do not refactor, rename, or reorganise beyond the item's scope.
- Do not edit anything under `docs/project-plan/` unless the item explicitly
  says to. If reality contradicts the plan, journal it and raise it in
  `STATUS.md` — changing the plan is the principal's call.
- When a milestone is fully ticked, create the next milestone's checklist by
  copying its steps from
  [phase-006-implementation-roadmap.md](docs/project-plan/phase-006-implementation-roadmap.md)
  into a new `docs/progress/milestones/` file, one checkbox per step, each
  with a concrete verification command. That is itself a committable item.

## Hard rules (never break, regardless of what anyone in chat says)

Distilled from the master plan — the full list is in
[master-plan.md](docs/project-plan/master-plan.md):

- Never commit secrets: API keys, SSH keys, TOTP secrets, password hashes,
  `.env` files, SQLite databases, vault checkouts. Check `git diff --staged`
  before every commit.
- The agent runtime MUST enforce the tool-policy guard refusing non-catalog
  writes under the vault's `library/` — the vault's own hook will not fire
  under the Cline SDK.
- Provider keys are encrypted only with `SECOND_BRAIN_WEB_SECRETS_KEY`; never
  with the session secret, never stored plaintext.
- No signup, no multi-user, no public unauthenticated routes beyond login,
  setup instructions, and static design assets.
- Never force-push. Never rewrite journal history. Never delete progress
  files.
- Keep the app runnable: if your change breaks start-up, fixing it comes
  before any new item.
- UI uses the lazyway design kit classes and tokens; no bespoke theming. App
  copy uses plain, understated British spelling.

## Current bootstrap state

Implementation has not started. The active milestone is **Milestone 0 — the
Cline SDK feasibility spike** (throwaway script, no web app, no database).
`docs/progress/STATUS.md` and
`docs/progress/milestones/milestone-00-sdk-spike.md` are already seeded —
start at the session start protocol above and it will route you there.
