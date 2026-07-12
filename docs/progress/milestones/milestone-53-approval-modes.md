# Milestone 53 — Four approval modes (Manual / Normal / Auto / Chat)

Principal request (2026-07-12): replace read-only/normal/high-trust with four
Claude-style modes, presented as a popup menu like the model menu (narrower):

- **Manual** — vault reads + safe (read-only) commands auto-allowed; every
  other operation asks.
- **Normal** (default) — vault reads/edits/commands allowed (git makes vault
  actions reversible, so protect `.git`); destructive commands (`rm`, hard
  resets, …) and anything outside the vault ask. Web search/fetch stay safe.
- **Auto** — everything in the vault allowed, including destructive commands;
  outside the vault still asks. Web stays safe.
- **Chat** — no vault access at all (not even reads): every vault-touching
  tool asks, so the user can approve a one-off or switch modes. Web stays safe.

Invariants in every mode: the `library/` originals guard still hard-denies,
and `.git` is protected from writes/destructive commands (also stated in the
system prompt).

- [ ] **m53-01** Policy engine: new `ApprovalPreset` values with legacy
  mapping (`read-only`→`manual`, `high-trust`→`auto`), helpers (safe read
  command, destructive command, outside-vault path/command, `.git`
  protection), and the mode matrix in `evaluateTool`; existing tests updated.
  Verify: `cd app && npm test --workspace server -- tool-policy.test.ts chat-approvals.test.ts`
- [ ] **m53-02** Wiring: schema v16 migrates stored presets; routes validate
  the new values (legacy accepted); internal auto-sessions (inbox uploads,
  capture, follow-ups) use `auto`; system prompt gains the `.git` protection
  line.
  Verify: `cd app && npm test --workspace server`
- [ ] **m53-03** Web: approvals select becomes a modes popup menu (model-menu
  styling, narrower) with names + descriptions + active check; chatDefaults
  keep working (legacy values normalised).
  Verify: `cd app && npm run lint && npm run build` + Playwright screenshot
- [ ] **m53-04** Full verify + archive.
  Verify: `cd app && npm run lint && npm test && npm run build`
