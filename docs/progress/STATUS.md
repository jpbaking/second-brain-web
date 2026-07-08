# STATUS — single source of truth

Updated: 2026-07-08 (m0a-07 complete)

## Where we are

- Phase: pre-implementation, **SDK feasibility spike DONE — verdict GO**.
  All findings and binding decisions: `docs/spike/findings.md` (m00-10
  section has the decision list).
- Active milestone: **Milestone 0A — Scaffold**.
- Checklist: `docs/progress/milestones/milestone-0a-scaffold.md`
- App runnable: yes, with `SECOND_BRAIN_WEB_DATA_DIR` pointing at a private
  `0700` data root.

## Next step

- First unchecked item in the milestone 0A checklist (m0a-08).

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
