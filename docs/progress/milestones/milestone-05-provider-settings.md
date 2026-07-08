# Milestone 5 — Provider Settings

Source: `docs/project-plan/phase-006-implementation-roadmap.md`, Milestone 5;
`docs/project-plan/phase-002-security-auth-and-secrets.md` (Provider API Keys /
Required storage); `docs/project-plan/phase-004-agent-runtime-and-chat.md`
(Provider And Model Selection).

Deliverable: the owner can configure Anthropic, OpenAI, or an OpenAI-compatible
endpoint (e.g. LM Studio) and choose the profile when starting a chat.

Binding constraints (hard rules):
- Provider keys are encrypted at rest with **`SECOND_BRAIN_WEB_SECRETS_KEY`
  only** — never `SECOND_BRAIN_WEB_SESSION_SECRET`, never plaintext. If the key
  is not configured, refuse to store provider keys with an actionable message.
- API keys are stored server-side only and **never returned to the browser**
  after save (show presence + masked suffix at most). Never log keys or write
  them to git/vault/transcripts.
- All provider routes are private (behind the m02 auth guard).

- [x] **m05-01** — Secrets crypto module: authenticated encryption
      (AES-256-GCM) keyed by a scrypt-derived key from
      `SECOND_BRAIN_WEB_SECRETS_KEY`; a helper reports whether secret storage is
      configured. Fail closed when the key is missing/invalid.
      Verify: `npm test --workspace server -- secrets.test.ts` — encrypt→decrypt
      round-trips; ciphertext differs per call (random nonce); a wrong key fails
      to decrypt; a missing key yields a clear "not configured" signal.
- [x] **m05-02** — Provider profile store: core migration adds a
      `provider_profiles` table (id, display name, provider id, model id, base
      url, headers json, config json, enabled, is_default, key ciphertext, key
      last4, timestamps) and a store (list, get, create, update, delete, set
      default, get default) enforcing a single default.
      Verify: `npm test --workspace server -- provider-store.test.ts` — CRUD
      round-trips; the API key is persisted only as ciphertext + last4 (no
      plaintext in the row); setting a default clears the previous default.
- [ ] **m05-03** — Provider CRUD endpoints: guarded `GET /api/providers` (list,
      masked, never the key), `POST` (create; encrypts the key),
      `PUT /api/providers/:id`, `DELETE /api/providers/:id`, and
      `POST /api/providers/:id/default`.
      Verify: `npm test --workspace server -- provider-api.test.ts` — unauth
      401; a created profile returns masked key info and no key material; the
      list never contains the key; storing a key with `SECRETS_KEY` unset is
      refused with an actionable error.
- [ ] **m05-04** — Provider test action: `POST /api/providers/:id/test` sends a
      minimal request to the configured endpoint (OpenAI-compatible / Anthropic)
      using the decrypted key + base URL and reports ok/error without leaking
      the key.
      Verify: `npm test --workspace server -- provider-test.test.ts` — against a
      local stub OpenAI-compatible server the test reports success; an
      unreachable/401 endpoint reports a clear failure.
- [ ] **m05-05** — Default profile + session snapshot: resolve the default
      profile and produce an in-memory provider snapshot (decrypted key, model,
      base URL, headers) that a chat session captures at start.
      Verify: `npm test --workspace server -- provider-snapshot.test.ts` —
      the default resolves; the snapshot carries the decrypted key + base URL +
      model; no snapshot when no default/enabled profile exists.
- [ ] **m05-06** — Provider settings page (`web/`): guarded `/providers` screen
      to list profiles (masked), add/edit (provider type, model, key, base URL),
      set default, test, and delete; wired into the shell nav.
      Verify: prod build; authenticated headless load of `/providers` shows the
      list/form; 390×844 screenshot; `npm run lint && npm test && npm run build`
      pass.
- [ ] **m05-07** — Milestone deliverable check: the owner can configure an
      Anthropic / OpenAI / OpenAI-compatible profile, mark it default, and it is
      selectable for a chat; keys are encrypted and never returned.
      Verify: end-to-end with a running server (and `SECOND_BRAIN_WEB_SECRETS_KEY`
      set) — create a profile with a key, confirm the list masks it, set it
      default, and confirm the snapshot resolves; full lint/test/build; grep the
      DB/responses to prove no plaintext key; no secrets tracked by git.
