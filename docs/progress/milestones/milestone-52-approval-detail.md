# Milestone 52 — Approval requests show what the tool will do

Principal report (2026-07-12): the approval card only says "Approve editor?" —
it is unclear what the agent actually intends to create/update/execute. The
SDK approval request already carries the tool `input`; surface it.

- [ ] **m52-01** Server: `summariseToolInput(toolName, input)` → bounded
  `detail` ({ path?, command?, preview?, truncated }) persisted on the
  `approval_request` event (path/command verbatim; content/diff or remaining
  input JSON as a size-capped preview).
  Verify: `cd app && npm test --workspace server -- tool-policy.test.ts chat-approvals.test.ts`
- [ ] **m52-02** Web: the approval card names the target — path or command
  inline, plus a collapsible monospace preview when present.
  Verify: `cd app && npm run lint && npm run build` + Playwright screenshot
- [ ] **m52-03** Full verify + archive: lint, full suite, build; archive this
  checklist, update STATUS.
  Verify: `cd app && npm run lint && npm test && npm run build`
