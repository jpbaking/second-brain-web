# Milestone 12 - Production Hardening

Roadmap source: `docs/project-plan/phase-006-implementation-roadmap.md` (Milestone 12).
Deliverable: the app can be deployed as a self-hosted private service with a durable data volume.

Note: several items are ops/docs rather than app code. Where a step is documentation,
the verification is a concrete presence/content check so it can still be verified.

- [x] **m12-01:** Add a multi-stage Dockerfile that builds `server` + `web` and runs the server, reading config from env and persisting the data root on a volume. (Verification: `docker build -t second-brain-web .` succeeds — or, if Docker is unavailable in this env, `npm run build` produces `server/dist` + `web/dist` and the Dockerfile only copies those; journal which path was used)
- [ ] **m12-02:** Write a deployment guide covering reverse-proxy setup and HTTPS assumptions (localhost bind + TLS terminator). (Verification: `test -f docs/deploy/deployment.md && grep -Eqi "reverse proxy|https" docs/deploy/deployment.md`)
- [ ] **m12-03:** Document backup and restore of the data volume (db, indexes, ssh, auth, workspaces). (Verification: `grep -Eq "db|indexes|ssh|auth|workspaces" docs/deploy/backup-restore.md` and a documented restore that boots against the restored data root)
- [ ] **m12-04:** Enforce secret file permission checks at startup (owner.json, deploy_key, secrets key material must be private; refuse or warn otherwise). (Verification: `npm test --workspace server -- secret-permissions.test.ts`)
- [ ] **m12-05:** Ensure structured (JSON) request/error logs with sensible fields and no secret leakage. (Verification: `npm test --workspace server -- structured-logs.test.ts`)
- [ ] **m12-06:** Add minimal smoke tests that boot the built app and exercise health + login + an authenticated route. (Verification: `npm test --workspace server -- smoke.test.ts`)
- [ ] **m12-07:** Deliverable check: deploy as a self-hosted private service with a durable data volume and verify a clean cold start. (Verification: `npm run lint && npm test && npm run build` plus a documented container/cold-start run against a persisted data volume)
