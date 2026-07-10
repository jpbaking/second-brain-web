# Milestone 10 - Derived Search

Roadmap source: `docs/project-plan/phase-006-implementation-roadmap.md` (Milestone 10).
Deliverable: the owner can search vault memory and reports quickly.

- [x] **m10-01:** Scan `memory/`, report files, and catalogs into typed search records (path, type, title, text, mtime), skipping symlinks and unsupported files. (Verification: `npm test --workspace server -- search-scan.test.ts`)
- [x] **m10-02:** Build a SQLite FTS index from the scanned records with a deterministic (re)build. (Verification: `npm test --workspace server -- search-index.test.ts`)
- [x] **m10-03:** Expose an authenticated search API that queries the FTS index and returns ranked, snippet-bearing hits. (Verification: `npm test --workspace server -- search-api.test.ts`)
- [ ] **m10-04:** Build the responsive search screen wired into the shell nav (query box, ranked results, empty/loading states). (Verification: `npm run lint --workspace web && npm run build --workspace web` plus responsive visual verification)
- [ ] **m10-05:** Rebuild the index on demand and after vault changes (commit/upload), without leaving stale entries. (Verification: `npm test --workspace server -- search-rebuild.test.ts`)
- [ ] **m10-06:** Deliverable check: search memory and reports quickly and open a hit. (Verification: `npm run lint && npm test && npm run build` plus browser end-to-end verification)
