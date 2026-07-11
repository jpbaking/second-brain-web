# Milestone 42: Durable reasoning transcript

## Tasks

- [x] m42-01: Extract and test transcript folding that distinguishes incremental chunks from cumulative agent snapshots, without erasure or duplication.
  - Verify: `cd app && npm test --workspace web`
- [x] m42-02: Preserve emitted status/reasoning activity per assistant turn and render completed details in an accessible expandable/collapsible disclosure.
  - Verify: `cd app && npm test --workspace web && npm run build --workspace web`
- [x] m42-03: Run full regression and visually verify live and completed reasoning states.
  - Verify: `cd app && npm run lint && npm test && npm run build`
