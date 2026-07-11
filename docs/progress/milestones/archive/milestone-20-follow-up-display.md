# Milestone 20 — Clean follow-up display text

Directed by the principal (2026-07-11): take the next recommended backlog
item. Hide terminal inline `— source: [label](path)` attribution from the
follow-up text shown in the web console while preserving the canonical raw
Markdown for parsing and agent-routed edits.

- [x] **m20-01:** Add a presentation-only formatter and use it for follow-up row text, accessible labels, and edit defaults without changing the API/parser representation or resolved `linkedSource`. (Verification: `cd app && npm run lint --workspace web && npm run build --workspace web`)
- [x] **m20-02:** Verify the full deliverable with the source-link parser regressions, full lint/test/build gate, and a browser check proving clean display text plus the separate resolved source. (Verification: `cd app && npm test --workspace server -- follow-ups-parse.test.ts follow-ups-api.test.ts && npm run lint && npm test && npm run build`)
