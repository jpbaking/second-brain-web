# Milestone 17 — Encrypted TOTP secret at rest

Directed by the principal (2026-07-11): take the next recommended backlog
item. Encrypt the owner TOTP secret in `auth/owner.json` using only
`SECOND_BRAIN_WEB_SECRETS_KEY`, while preserving login and reset behaviour and
safely handling existing plaintext owner state.

- [x] **m17-01:** Define encrypted owner-state v2 and persistence helpers: newly written `owner.json` contains authenticated ciphertext rather than `secretBase32`, uses only `SECOND_BRAIN_WEB_SECRETS_KEY`, retains mode 0600, and refuses a missing key. Keep generated bootstrap material usable for the one-time otpauth display. (Verification: `cd app && npm test --workspace server -- auth-bootstrap.test.ts`)
- [x] **m17-02:** Load/decrypt v2 owner state for password/TOTP login and migrate legacy v1 plaintext state to v2 without changing credentials; failures must be explicit and must not overwrite unreadable/corrupt state. (Verification: `cd app && npm test --workspace server -- owner.test.ts auth-flow.test.ts`)
- [ ] **m17-03:** Update reset-auth and test fixtures/call sites for mandatory encrypted persistence; document the key requirement and stored format without exposing secrets. (Verification: `cd app && npm test --workspace server -- auth-bootstrap.test.ts owner.test.ts auth-flow.test.ts reset-invalidation.test.ts && npm run lint`)
- [ ] **m17-04:** Deliverable check: fresh reset writes no plaintext TOTP secret, real password+TOTP login succeeds, legacy owner state migrates and still logs in, wrong/missing keys fail safely, and the full app remains green. (Verification: `cd app && npm run lint && npm test && npm run build` plus a fresh CLI/login integration check)
