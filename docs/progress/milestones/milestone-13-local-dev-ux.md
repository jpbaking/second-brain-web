# Milestone 13 - Local Build/Run UX (principal-directed, post-roadmap)

Directed by the principal (2026-07-11): make building→running this locally as
easy as possible for anyone, with [compose-helper](https://github.com/jpbaking/compose-helper)
as the primary way of building/running in dev, and formalise the temp Vite
config change that lets a TLS-terminating proxy (e.g. nginx-proxy-manager)
front the dev servers.

- [x] **m13-01:** Formalise the dev-server config: Vite host/port and the API port offset stay env-driven, and `allowedHosts` comes from an env var instead of a hardcoded personal hostname. (Verification: `npm run lint --workspace web && npm run build --workspace web`, plus a dev-server boot showing the env-driven host/port/allowedHosts take effect)
- [ ] **m13-02:** Add compose-helper as the primary run path: committed `compose-helper.sh`, `compose-helper.env` (project name), `docker-compose.yaml` (build + volume + env passthrough + healthcheck), and `.env.example`. (Verification: `./compose-helper.sh build` then `start` → `/api/health` 200 with data on the named volume; `stop` preserves data)
- [ ] **m13-03:** Rewrite the README quick start around `./compose-helper.sh` (with bare-metal dev + proxy/SSL fronting notes) and point `docs/deploy/deployment.md` at compose for local runs. (Verification: `grep -q "compose-helper" README.md docs/deploy/deployment.md`)
- [ ] **m13-04:** Deliverable check: clean-clone-style run — compose up → healthy → owner setup → login-capable; dev servers boot on the configured host/port. (Verification: `npm run lint && npm test && npm run build` plus the compose cycle exercised for real)
