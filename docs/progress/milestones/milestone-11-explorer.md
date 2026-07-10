# Milestone 11 - Explorer

Roadmap source: `docs/project-plan/phase-006-implementation-roadmap.md` (Milestone 11).
Deliverable: the owner can visually explore memory/library relationships.

- [x] **m11-01:** Extract links from vault markdown (memory pages, catalogue, report sources) into typed edges (from_path, to_path, label), resolving vault-relative targets and ignoring external/escaping links. (Verification: `npm test --workspace server -- explorer-links.test.ts`)
- [x] **m11-02:** Persist the link graph in the sidecar (`vault_links`) with a deterministic (re)build, reusing the search reindex triggers. (Verification: `npm test --workspace server -- explorer-graph.test.ts`)
- [x] **m11-03:** Expose an authenticated explorer API returning nodes and edges with area filters. (Verification: `npm test --workspace server -- explorer-api.test.ts`)
- [ ] **m11-04:** Build the responsive graph/list explorer screen wired into the shell nav. (Verification: `npm run lint --workspace web && npm run build --workspace web` plus responsive visual verification)
- [ ] **m11-05:** Add area filters and a detail panel (path, title, latest entries, links) to the explorer. (Verification: `npm test --workspace server -- explorer-api.test.ts -t "detail" && npm run build --workspace web`)
- [ ] **m11-06:** Deliverable check: visually explore memory/library relationships and open a node. (Verification: `npm run lint && npm test && npm run build` plus browser end-to-end verification)
