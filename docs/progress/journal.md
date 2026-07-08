# Journal — append-only work log

Never edit or delete past entries. New entries go at the bottom.

## 2026-07-08 — bootstrap (planning session)

Progress-tracking system created alongside `AGENTS-PLAYBOOK.md`. Plan pack in
`docs/project-plan/` reviewed and refined the same day (SDK feasibility spike
added as Milestone 0; `library/` tool-policy guard made mandatory; MVP
slimmed; stack set to a plain long-lived Node service + Vite/React). No
implementation exists yet. Next: milestone 00 checklist, item m00-01.

## 2026-07-08 12:35 — session start
Tree clean at d523094. Active: milestone 00, next item: m00-01. Note: SECOND_BRAIN_SPIKE_API_KEY not set in this environment; key-dependent items will be blocked unless provided.

- 12:35 STARTED m00-01: research current Cline SDK packages/entry points/Agent construction; record in docs/spike/findings.md
- 12:37 DONE m00-01: findings.md created; packages confirmed on npm (@cline/core 0.0.58, sdk=alias, agents/llms/shared; Node >=22). Approval = requestToolApproval async callback (good for web). Docs silent on clinerules/workflows/skills/hooks. Committing.
- 12:37 STARTED m00-02: scaffold spike/ Node project, install @cline/core @cline/llms @cline/shared
- 12:44 DONE m00-02: spike scaffolded, ClineCore session ran against LM Studio ornith-1.0-9b@q4_k_m (principal chose model mid-session). Key gotcha: lmstudio baseUrl needs /v1. Verified by `node spike/01-hello.mjs` -> assistant reply persisted. Bonus: SDK search paths natively include .clinerules layouts.
- 12:45 STARTED m00-03: clone public second-brain template into spike/test-vault, seed dummy data, run health.py
- 12:46 DONE m00-03: public template cloned to spike/test-vault (git-ignored), dummy dossier/project/original seeded per vault conventions; health.py reports healthy. Private vault untouched.
- 12:47 STARTED m00-04: multi-turn test — codeword in turn 1, recall in turns 2 and 3 via cline.send
- 12:48 DONE m00-04: multi-turn PASS via `node spike/02-multiturn.mjs` (codeword recalled across 3 turns). Bonus: .clinerules auto-loaded from cwd — secretary persona appeared without us injecting it.
- 12:48 STARTED m00-05: resume across process restart (script A plants codeword and exits; script B resumes)
- 12:49 DONE m00-05: resume PASS via rehydration (readMessages + initialMessages); plain send across restart = session_not_found. DECISION: app-side rehydration is the primary continuity path.
