# Milestone 59: Workflow autocomplete UX

- [x] **m59-01** — Return workflow names with one-line descriptions derived
  from their introductory Markdown paragraphs. Verification:
  `npm test --workspace server -- workflow.test.ts`.
- [x] **m59-02** — Hide workflow chips, show descriptions and an unmistakable
  selected state in slash autocomplete, and allow selection to create and run
  a fresh chat using its chosen defaults. Verification:
  `npm run lint --workspace web && npm run build --workspace web`.
- [ ] **m59-03** — Run the full project verification gate and archive the
  milestone. Verification: `npm run lint && npm test && npm run build`.
