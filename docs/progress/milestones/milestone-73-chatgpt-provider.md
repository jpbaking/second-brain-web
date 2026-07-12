# Milestone 73 — ChatGPT (subscription) provider

Principal-directed 2026-07-13. Add a `chatgpt` provider type that runs a
ChatGPT subscription through the Cline SDK's `openai-codex` provider, with
OAuth handled by `./configure` (not compose-helper — see design notes).

## Design notes (research done 2026-07-13, session start)

- The SDK ships everything needed: `loginOpenAICodex` /
  `refreshOpenAICodexToken` / `getValidOpenAICodexCredentials` in
  `@cline/core` (`dist/auth/codex.d.ts`), provider id `openai-codex` in
  `@cline/llms`, and `CoreModelConfig.providerConfig` accepts
  `accessToken`/`refreshToken`/`accountId` (`AuthConfig`).
- Unlike `claude-code` (credential owned by the Claude CLI's home dir inside
  the running container, hence `compose-helper.sh claude-auth`), ChatGPT
  credentials are plain values: `{ access, refresh, expires, accountId }`
  (`OAuthCredentials`). They are therefore stored like API keys — encrypted
  with `SECOND_BRAIN_WEB_SECRETS_KEY`, never plaintext — as a JSON blob in
  the existing profile-secret slot.
- `loginOpenAICodex` spins a localhost:1455 callback server and supports a
  manual paste-the-code fallback (`onManualCodeInput`) — use the fallback so
  the flow also works when `configure` runs via `docker run` (port 1455
  unpublished) or over SSH.
- Refresh: access tokens expire; before each session start the server must
  run the blob through `getValidOpenAICodexCredentials` and persist the
  rotated blob back to the profile secret in SQLite.
- Provider id mapping: ours `chatgpt` → SDK `openai-codex` (runner
  `PROVIDER_ID_MAP`), catalog `openai-codex` (capabilities
  `CATALOG_PROVIDER`); model list from the generated catalog filtered by
  `filterOpenAICodexModels` — no live HTTP model listing.
- Out of scope: ChatGPT OAuth from the web `/providers` page (backlog).

## Read before working

- `AGENTS-PLAYBOOK.md`
- `app/server/src/agent/runner.ts`, `app/server/src/providers/`
- `app/server/src/cli/configure.ts` + `configure-lib.ts`
- `app/node_modules/@cline/core/dist/auth/codex.d.ts`
- `docs/progress/milestones/archive/milestone-36-*.md` (claude-code
  precedent), `milestone-15-*.md` (declarative provisioning)

## Checklist

- [x] **m73-01 — provider id plumbing.** Add `chatgpt` to
  `KNOWN_PROVIDERS` (configure-lib + provisioning), `PROVIDER_ID_MAP`
  (`chatgpt` → `openai-codex`), and `CATALOG_PROVIDER` (`chatgpt` →
  `openai-codex`); provisioning rejects `base_url` for `chatgpt`.
  Verify: `cd app && npm test --workspace server -- runner.test.ts
  provisioning.test.ts configure-lib.test.ts` green with new cases.
- [x] **m73-02 — OAuth credential blob through snapshot + runner.** Define
  the encrypted secret JSON shape `{ access, refresh, expires, accountId? }`;
  `toModelConfig` detects `chatgpt`, parses the blob from the snapshot's
  secret, and emits `providerConfig` with
  `accessToken`/`refreshToken`/`accountId` (no `apiKey`).
  Verify: `npm test --workspace server -- runner.test.ts` green with new
  cases incl. malformed-blob error path.
- [x] **m73-03 — token refresh + persistence.** Before session start, run
  chatgpt credentials through `getValidOpenAICodexCredentials` (injected so
  tests fake it); when rotated, re-encrypt and persist to the profile secret.
  Verify: `npm test --workspace server -- ` new test file green (rotated blob
  persisted, expired-refresh error surfaces as a typed AppError).
- [ ] **m73-04 — configure CLI ChatGPT login.** `configure` add/edit offers
  `chatgpt`: runs `loginOpenAICodex` (print URL + manual code fallback, no
  callback-server dependency), picks the model from the SDK catalog
  (`filterOpenAICodexModels`), writes the encrypted blob into
  `providers.yaml`; provisioning imports it into the profile secret.
  Verify: `npm test --workspace server -- configure` suites green; manual
  `./configure` run adds a chatgpt provider end-to-end.
- [ ] **m73-05 — web `/providers` display.** A chatgpt profile renders like
  claude-code's CLI-auth style ([OAuth] instead of key controls), never
  exposing the blob. Verify: `cd app && npm run lint && npm test && npm run
  build`; screenshot of `/providers` with a chatgpt profile.
- [ ] **m73-06 — docs + live verification.** README/provider docs mention
  the chatgpt provider and `./configure` login; run a live chat turn on a
  chatgpt profile (or journal BLOCKED if the principal must supply the
  login). Verify: live turn streams a reply, or a BLOCKED entry with exact
  errors.
