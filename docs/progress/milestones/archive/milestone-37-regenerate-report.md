# Milestone 37: Regenerate Report

A report shelf action that reruns the same report request against the current vault state.
Design hook: Store report provenance: originating session, prompt/workflow, provider profile, vault commit, and generated path.

- [x] m37-01: Add `report_provenance` table to core database migrations
  `npm test --workspace server -- migrations.test.ts`
- [x] m37-02: Add `app/server/src/reports/store.ts` for provenance CRUD operations
  `npm test --workspace server -- reports-store.test.ts`
- [x] m37-03: Update agent session completion to save provenance for newly generated reports
  `npm test --workspace server -- agent-session.test.ts`
- [x] m37-04: Update `GET /api/reports` to merge provenance data into `ReportMetadata`
  `npm test --workspace server -- reports-api.test.ts`
- [x] m37-05: Add `POST /api/reports/regenerate/*` endpoint to kick off regeneration
  `npm test --workspace server -- reports-api.test.ts`
- [x] m37-06: Add "Regenerate" UI button and wire up frontend API call
  `npm run build --workspace web`
