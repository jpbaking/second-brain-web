# Milestone 66 — Explorer revamp: vault file browser

Replace the link-graph `/explorer` with a simple **read-only file browser** of
the vault checkout. Clicking a Markdown file shows a rendered preview
(react-markdown + remarkGfm, as chat); other text files show plain text.
The graph UI and its two API endpoints are dropped. Link extraction
(`explorer/links.ts`, `explorer/graph.ts`) stays — search reindex uses it.

Scope agreed with the principal 2026-07-12: read-only (no rename/delete/
download); no link data in the file view; graph dropped entirely.

- [x] **m66-01** Server: replace `/api/explorer` routes with a file-browser
  API. `GET /api/explorer/tree?path=<dir>` lists one directory of the vault
  workspace (dirs first, then files; names + sizes; `.git` and dotfiles
  hidden; safe-path guard reused). `GET /api/explorer/file?path=<file>`
  returns `{ path, title, size, kind: 'markdown'|'text'|'binary', content }`
  with content capped (~256 KB) and empty for binary. Rewrite
  `explorer-api.test.ts` for the new endpoints (traversal rejection, dir
  listing, md/text/binary file reads, 404s).
  Verify: `cd app && npm test --workspace server -- explorer-api.test.ts`
- [x] **m66-02** Web: rewrite `ExplorerScreen.tsx` as the file browser —
  breadcrumb path, directory listing, file pane with rendered Markdown
  (react-markdown + remarkGfm) or plain text; kit classes only; update
  hero tagline; remove graph CSS that is now unused.
  Verify: `cd app && npm run lint && npm run build`
- [ ] **m66-03** Full verify + archive: `cd app && npm run lint && npm test
  && npm run build`; Playwright/headless screenshot of `/explorer` browsing
  into a folder and previewing a Markdown file; then archive this checklist,
  update `STATUS.md` + `BACKLOG.md`.
  Verify: full suite green + screenshot reviewed
