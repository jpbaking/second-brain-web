# Milestone 68 — explorer file download

Principal-directed 2026-07-12: in `/explorer`, hovering a file row reveals a
download icon at the right of the row, so any file (Markdown or not) can be
downloaded raw. Folders are browse-only (no zip download in this milestone).

- [x] **m68-01** Server: `GET /api/explorer/download?path=<file>` streams the
  raw file bytes with `Content-Disposition: attachment` (safe-path guard, no
  symlinks, 404 for missing/non-files; no size cap — it is a download, not a
  preview). Extend `explorer-api.test.ts`.
  Verify: `cd app && npm test --workspace server -- explorer-api.test.ts`
- [ ] **m68-02** Web: hover (and focus) on a file row shows a download icon
  button right of the row linking to the download endpoint; extend
  `explorer.spec.ts` to download a file; screenshot the hover state.
  Verify: `cd app && npm run lint && npm run build && npx playwright test
  explorer.spec.ts`; then archive this checklist, update STATUS + BACKLOG.
