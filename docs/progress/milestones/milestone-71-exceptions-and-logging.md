# Milestone 71 — traceable exceptions and configurable logging

Principal-directed 2026-07-13: improve debugging traceability with Java-style
cause chains from `error-extender`, replace runtime console/Pino logging with
`log4js`, and make the root log level configurable through `.env`.

- [ ] **m71-01** Add `error-extender` and `log4js`; introduce structured
  log4js configuration and safe HTTP request/response/error logging; expose
  `SECOND_BRAIN_WEB_LOG_LEVEL` through the configurator, compose, and
  `.env.example`; cover level validation/filtering and credential redaction.
  Verify: `cd app && npm test --workspace server -- structured-logs.test.ts config.test.ts configure-lib.test.ts && npm run lint`

- [ ] **m71-02** Move the server's custom error types onto a shared
  `error-extender` hierarchy, preserve underlying causes at rethrow boundaries,
  and route background/start-up failures through named log4js categories with
  full chained stacks.
  Verify: `cd app && npm test --workspace server -- errors.test.ts provider-provisioning.test.ts migrations.test.ts secrets.test.ts upload.test.ts chat-uploads.test.ts workflow.test.ts reports-api.test.ts && npm run lint`

- [ ] **m71-03** Run the complete server/web verification, document the final
  operator setting, archive the milestone, and return STATUS to no active work.
  Verify: `cd app && npm run lint && npm test && npm run build`
