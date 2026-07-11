# Milestone 19 — Slim Docker runtime image

Directed by the principal (2026-07-11): take the next recommended backlog
item. Remove web-only production dependencies from the runtime image while
preserving the server's complete dependency tree and production behaviour.
Baseline local image `second-brain-web:latest`: 1.28 GB.

- [x] **m19-01:** Scope the runtime-stage production install to the server workspace only, and prove the resulting image retains required server modules while excluding web-only React packages. Record before/after image sizes. (Verification: `docker build -t second-brain-web:m19 .` from `app/`, then inspect image size and `node_modules` module resolution inside the image)
- [x] **m19-02:** Smoke-test the slim image as the unprivileged `node` user with a fresh persistent `/data` volume: health, static login page, reset-auth, real password+TOTP login, and a guarded route must succeed. (Verification: real `docker run` + HTTP integration check against `second-brain-web:m19`)
- [ ] **m19-03:** Run the full source gate and verify the production image remains smaller than the 1.28 GB baseline with web-only packages absent; update deployment notes if the runtime install command changed operator-relevant assumptions. (Verification: `cd app && npm run lint && npm test && npm run build`, plus `docker image inspect second-brain-web:m19` size comparison)
