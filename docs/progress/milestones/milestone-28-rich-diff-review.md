# Milestone 28: Rich Diff Review

## Read before working
- `docs/project-plan/phase-008-feature-backlog-and-design-hooks.md` (Rich Diff Review section)
- `app/server/src/vault/git-status.ts`
- `app/server/test/vault-review.test.ts`
- `app/web/src/ReviewCommitModal.tsx`

## Checklist

- [ ] m28-01: **Add per-file diffs to review API.** Update `readGitStatus` to optionally return line-by-line unified diff content for each changed file, extending the `ReviewData` response from `/api/vault/review`.
  - *Verify:* `cd app && npm test --workspace server -- vault-review.test.ts`
- [ ] m28-02: **Support partial commits and reverts.** Update the commit API endpoint to accept an array of specific file paths to commit, and add an endpoint to discard/checkout specific files.
  - *Verify:* `cd app && npm test --workspace server -- vault-review.test.ts` (or create appropriate new tests)
- [ ] m28-03: **Semantic grouping in UI.** Update `ReviewCommitModal.tsx` (or extract into a larger `RichReviewModal.tsx`) to group changed files by semantic type (e.g., Memory Logs, Reports, Inbox) instead of a flat list.
  - *Verify:* `cd app && npm run lint` and `npm run build`
- [ ] m28-04: **Per-file accept/discard UI.** Add controls in the review UI to select specific files for commit or to discard unwanted changes, wired to the new API capabilities.
  - *Verify:* `cd app && npm run build`
- [ ] m28-05: **Render previews for logs and reports.** Add a preview mode/toggle in the diff UI that renders the full markdown content of the file (Memory log preview / Report preview) alongside the raw diff.
  - *Verify:* `cd app && npm run build`
