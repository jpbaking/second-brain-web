# Milestone 29: Playwright Integration Testing

Move away from disposable headless Chrome CDP scripts to a structured Playwright integration testing suite, kept isolated to avoid bloating the production image.

- [x] m29-01: Scaffold Playwright configuration in `app/test/e2e` with dependencies installed as devDependencies. (Verify: `cd app && npm list @playwright/test`)
- [ ] m29-02: Configure `app/test/e2e/global-setup.ts` to boot the server and web application with a fake agent runner for testing. (Verify: `cd app && npm run build && npx playwright test --dry-run`)
- [ ] m29-03: Write an initial login integration test covering the password and TOTP flow. (Verify: `cd app && npx playwright test login.spec.ts`)
- [ ] m29-04: Ensure Docker build excludes Playwright binaries to keep the production image slim. (Verify: check `docker-compose.yaml` and `Dockerfile` to confirm devDependencies are excluded in production)
