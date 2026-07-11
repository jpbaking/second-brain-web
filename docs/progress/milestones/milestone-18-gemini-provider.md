# Milestone 18 — Native Gemini provider

Directed by the principal (2026-07-11): take the next recommended backlog
item. Expose the native `gemini` provider shipped by `@cline/llms`, including
provider validation, connectivity testing, and the settings UI.

- [x] **m18-01:** Add `gemini` to the app-to-SDK provider mapping and provider API allow-list, with regression tests proving Gemini profiles are accepted and translated unchanged for the SDK. (Verification: `cd app && npm test --workspace server -- agent-runner.test.ts provider-api.test.ts`)
- [ ] **m18-02:** Make the provider Test action probe Gemini's read-only `v1beta/models` endpoint using `x-goog-api-key`, without leaking the key in results, and cover success/rejection routing with a local stub. (Verification: `cd app && npm test --workspace server -- provider-test.test.ts`)
- [ ] **m18-03:** Add Gemini to the provider settings selector and verify the full deliverable: a Gemini profile can be created, mapped, tested, and selected without regressing existing providers. (Verification: `cd app && npm run lint && npm test && npm run build`)
