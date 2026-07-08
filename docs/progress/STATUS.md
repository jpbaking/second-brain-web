# STATUS — single source of truth

Updated: 2026-07-08 (milestone 00 complete)

## Where we are

- Phase: pre-implementation, **SDK feasibility spike DONE — verdict GO**.
  All findings and binding decisions: `docs/spike/findings.md` (m00-10
  section has the decision list).
- Active milestone: none — next is **Milestone 0A — Scaffold**.
- App runnable: n/a (no app code yet; `spike/` is throwaway).

## Next step

- Create `docs/progress/milestones/milestone-0a-scaffold.md` from the
  Milestone 0A section of the roadmap (one checkbox per step, each with a
  verification command), then start its first item.

## Read before working

- `docs/spike/findings.md` — m00-10 decisions (binding on implementation).
- `docs/project-plan/phase-006-implementation-roadmap.md` — Milestone 0A.
- `docs/project-plan/master-plan.md` — Suggested Stack + hard rules.

## Questions for the principal

- none currently. (Spike ran entirely on local LM Studio
  `ornith-1.0-9b@q4_k_m` per the principal's instruction; no cloud API key
  was needed.)

## Known issues / parked TODOs

- Global `~/.cline/skills` and rules paths merge into agent sessions — run
  the production app under a dedicated system user (fold into phase-007
  work when it comes up).
- SDK writes session artifacts to `~/.cline/data/sessions/` — find/confirm
  a data-root override option during 5A so session state lands under
  `/data/second-brain-web/sessions/`.
- `spike/test-vault/` is a git-ignored local clone; delete freely, reseed
  via findings m00-03 notes if a later item needs it.
