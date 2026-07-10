# Milestone 09A - Follow-Up Queue

- [x] **m9a-01:** Parse reminders and commitments Markdown into typed queue items. (Verification: `npm test --workspace server -- follow-ups-parse.test.ts`)
- [x] **m9a-02:** Expose authenticated follow-up data with overdue/today/week/waiting/I-owe/completed filters. (Verification: `npm test --workspace server -- follow-ups-api.test.ts`)
- [x] **m9a-03:** Build the responsive follow-up queue screen and filter tabs. (Verification: `npm run lint --workspace web && npm run build --workspace web` plus responsive visual verification)
- [ ] **m9a-04:** Link queue items to their source file and line where possible. (Verification: `npm test --workspace server -- follow-ups-api.test.ts -t "source" && npm run build --workspace web`)
- [ ] **m9a-05:** Route completion and edits through a vault-safe agent workflow. (Verification: `npm test --workspace server -- follow-ups-action.test.ts`)
- [ ] **m9a-06:** Deliverable check: filter, inspect, and safely update practical follow-ups. (Verification: `npm run lint && npm test && npm run build` plus browser end-to-end verification)
