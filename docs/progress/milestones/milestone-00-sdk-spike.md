# Milestone 00 — Cline SDK feasibility spike

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 0.

Everything here is **throwaway** except `docs/spike/findings.md`. Write the
spike code under `spike/`, do not polish it, do not add tests or lint to it.
No web app, no database. The point is answers, not architecture.

Provider API key: expect it in the `SECOND_BRAIN_SPIKE_API_KEY` environment
variable (ask the principal via STATUS.md if unset). Never commit it; add
`spike/.env*` to `.gitignore` in m00-01.

- [x] **m00-01** — Read current Cline SDK docs (<https://docs.cline.bot/sdk/overview>,
      tools, building-an-agent guides). Record in `docs/spike/findings.md`:
      actual package names and entry points (`@cline/core`, `@cline/agents`,
      `@cline/llms`, `@cline/shared` vs older `ClineCore`/`@cline/sdk`
      naming), Node version requirement, and how an `Agent` is constructed.
      Verify: findings file exists and names the packages you will install.
- [x] **m00-02** — Scaffold `spike/` as a Node 22+ project and install the
      SDK packages identified in m00-01.
      Verify: a hello-world script constructs an Agent and gets one model
      response.
- [x] **m00-03** — Prepare a test vault: clone the public `second-brain`
      template into `spike/test-vault/` (git-ignored) and add a few dummy
      memory pages, one dummy library original, and its catalog entry.
      Verify: `python3 spike/test-vault/scripts/health.py` runs.
- [x] **m00-04** — Multi-turn: can one agent session carry a conversation
      across several user turns with context intact?
      Verify: scripted 3-turn exchange where turn 3 depends on turn 1.
- [x] **m00-05** — Resume: can a session be resumed after the Node process
      exits and restarts, with working context intact? Test SDK
      persistence/checkpoint APIs found in m00-01.
      Verify: script A starts a task and exits; script B resumes and the
      agent still knows the task. Record the answer even if it is "no".
- [x] **m00-06** — Approvals: with `autoApprove: false` (or current
      equivalent), how does the consent request surface programmatically, and
      can it be answered asynchronously from another code path, the way a web
      route would answer it?
      Verify: a tool call pauses, is approved from outside the agent
      callback, and then executes.
- [x] **m00-07** — Rules: does the agent honour `.clinerules/` in the
      workspace by itself, or must rule files be injected into the system
      prompt?
      Verify: ask the agent something only `.clinerules/00-role.md` would
      make it do, with and without injection.
- [x] **m00-08** — Workflows and skills: does sending `/inbox.md` as a
      message trigger the workflow? Are `.cline/skills/` loaded at all? If
      not, prove the fallback: read the workflow file and send its content as
      the task prompt.
      Verify: a dummy inbox file gets processed via whichever path works.
- [x] **m00-09** — Tool-policy guard: implement a middleware/policy that
      refuses non-catalog writes under `library/` across every file-mutating
      tool, while still allowing move/rename via shell.
      Verify: agent is instructed to edit a library original and the write is
      refused; a catalog edit succeeds.
- [x] **m00-10** — Write up `docs/spike/findings.md`: one section per
      question above with the answer and evidence, plus the go/adjust
      decisions — primary continuity path (SDK resume vs app-side
      rehydration), rules/workflow loading approach, and guard implementation
      approach. Update `STATUS.md`: milestone 00 done, next is creating the
      milestone 0A checklist.
      Verify: findings doc answers all questions; STATUS.md points to the
      next milestone.
