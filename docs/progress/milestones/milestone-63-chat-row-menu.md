# Milestone 63 — chat-row "…" menu with rename

Principal direction (2026-07-12): replace the hover trash button with a small
per-row "…" menu holding Rename and Delete; renaming edits the title inline
(Enter saves via the existing `PATCH /api/chat/sessions/:id`, Escape cancels).

- [x] m63-01: hover "…" trigger left of the star opens a per-row menu with
      Rename and Delete; Delete behaves as before; Rename swaps the row title
      for an inline input (Enter save, Escape cancel, empty input ignored) and
      the sidebar list refreshes with the new title.
      Verify: `cd app && npm run build` then Playwright probe: open menu,
      rename a chat, assert new title in list; delete via menu removes row;
      screenshots of menu open and inline edit.
- [ ] m63-02: full check (`cd app && npm run lint && npm test && npm run
      build`), remove probe, archive checklist, update STATUS.
