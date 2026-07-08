# Milestone 2 — Authentication

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 2,
and `docs/project-plan/phase-002-security-auth-and-secrets.md` (Sessions, Login
Flow, Rate Limiting).

Deliverable: the app is inaccessible without password **and** TOTP, and existing
sessions are invalidated when owner auth is reset.

Binding constraints:
- Session cookie: `HttpOnly`, `SameSite=Lax` (or Strict), `Secure` in
  production, expiry 12–24h. Store only a hashed token server-side.
- Login is two-step: password → short-lived pending challenge → TOTP → session;
  destroy the challenge on success.
- Verify TOTP with a small clock skew (±1 step). Never log passwords or codes.
- Rate-limit password and TOTP failures; fail closed but never permanently lock
  the web out (the host reset script is the recovery path). Log metadata only.
- Never send the SSH private key or TOTP secret to the browser.

- [x] **m02-01** — Core-DB migration adds a `sessions` table (id, token hash,
      created/last-used/expiry timestamps, user-agent + IP for audit, revoked
      timestamp) and a session-store module (create, lookup-by-token, touch,
      revoke, revoke-all, purge-expired).
      Verify: `npm test --workspace server -- sessions.test.ts` — create then
      lookup returns an active session; expired and revoked lookups return
      none; revoke-all clears; token is stored hashed, not in the clear.
- [x] **m02-02** — Owner credential module loads `auth/owner.json`, verifies a
      password with Argon2id `verify`, and reports whether owner auth is
      configured.
      Verify: `npm test --workspace server -- owner.test.ts` — the password
      from a generated owner state verifies; a wrong password is rejected;
      absent `owner.json` reports not-configured (no throw).
- [x] **m02-03** — TOTP verification (base32 decode + HMAC-SHA1, RFC 6238) with
      a small clock-skew window, checked against the stored secret.
      Verify: `npm test --workspace server -- totp.test.ts` — RFC 6238 test
      vectors accepted; wrong/out-of-window codes rejected; ±1 step accepted.
- [x] **m02-04** — Login-flow endpoints: `POST /api/auth/password` verifies the
      password and issues a short-lived server-side pending challenge;
      `POST /api/auth/totp` verifies the code, creates a session, and destroys
      the challenge.
      Verify: `npm test --workspace server -- auth-flow.test.ts` — password then
      TOTP returns a `Set-Cookie` session; wrong password or TOTP returns 401
      with no session; TOTP without a valid challenge is refused.
- [x] **m02-05** — Session cookie issuance (flags per binding constraints) and
      an auth pre-handler guarding every private route; `/login`, the setup
      status endpoint, and static design assets stay public.
      Verify: `npm test --workspace server -- guard.test.ts` — a private route
      is 401 without a cookie and 200 with a valid session cookie; cookie flags
      (`HttpOnly`, `SameSite`, expiry) are asserted.
- [x] **m02-06** — Logout: `POST /api/auth/logout` revokes the current session
      and clears the cookie.
      Verify: `npm test --workspace server -- logout.test.ts` — after logout the
      session no longer authenticates and the response clears the cookie.
- [x] **m02-07** — Rate limiting: SQLite-backed failure counters per IP and per
      account with exponential backoff / temporary lock on repeated password or
      TOTP failures; a success resets counters; locks are time-bounded.
      Verify: `npm test --workspace server -- rate-limit.test.ts` — repeated
      failures trigger a delay/lock, success resets, and the lock expires.
- [ ] **m02-08** — Resetting owner auth invalidates existing sessions: the
      reset routine revokes all sessions and pending challenges.
      Verify: `npm test --workspace server -- reset-invalidation.test.ts` — a
      session valid before reset no longer authenticates afterwards.
- [ ] **m02-09** — Login page (`web/`): lazyway-kit-styled two-step login
      (password then TOTP) driving the endpoints, with error states, responsive
      on mobile.
      Verify: prod build served by Fastify; headless load of `/login` shows the
      password step and a mobile screenshot at 390×844; `npm run lint && npm
      test && npm run build` pass.
- [ ] **m02-10** — Milestone deliverable check: the app is inaccessible without
      password + TOTP, and existing sessions are invalidated on reset.
      Verify: with the server running, an authed route is refused
      unauthenticated, works after completing password + TOTP, and stops working
      after `reset-auth.sh` runs; full lint/test/build pass; no secrets tracked.
