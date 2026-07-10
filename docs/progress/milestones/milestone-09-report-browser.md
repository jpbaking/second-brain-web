# Milestone 09 - Report Browser

- [x] **m09-01:** Scan `reports/YYYY/` for HTML, PDF, and Markdown metadata. (Verification: `npm test --workspace server -- reports-scan.test.ts`)
- [x] **m09-02:** Serve report files through traversal-safe authenticated routes. (Verification: `npm test --workspace server -- reports-api.test.ts`)
- [x] **m09-03:** Build the report shelf with year/type filters and title/path search. (Verification: `npm run lint --workspace web && npm run build --workspace web` and responsive visual verification)
- [ ] **m09-04:** Open HTML reports and download PDF/Markdown through authenticated URLs. (Verification: `npm test --workspace server -- reports-api.test.ts && npm run build --workspace web`)
- [ ] **m09-05:** Add recent reports to the command centre. (Verification: `npm test --workspace server -- command-center.test.ts && npm run build --workspace web`)
- [ ] **m09-06:** Deliverable check: browse, open, search, and download generated reports. (Verification: `npm run lint && npm test && npm run build` plus browser end-to-end verification)
