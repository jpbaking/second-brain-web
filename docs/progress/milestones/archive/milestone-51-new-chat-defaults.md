# Milestone 51 — New-chat defaults follow the last new-chat settings

Principal request (2026-07-12): the provider/model settings last set in a
"new chat" (before the first send) become the defaults for future new chats.
Persisted server-side in the principal profile preferences
(`principal_profile.preferences_json`, generic merge-on-PUT store from
milestone 27) as `chatDefaults`: provider profile, approval preset, thinking,
reasoning effort.

- [x] **m51-01** Server: add `chatDefaults` to the `PrincipalProfile` type
  and cover the round-trip (PUT then GET) in the profile API test.
  Verify: `cd app && npm test --workspace server -- profile-api.test.ts`
- [x] **m51-02** Web: in the new-chat state, initialise the composer from
  `profile.chatDefaults` (validated against the loaded provider list); any
  change to provider / approvals / thinking / effort while no session exists
  PUTs the new defaults. Existing chats are untouched.
  Verify: `cd app && npm run lint && npm run build` + Playwright check
- [x] **m51-03** Full verify + archive: lint, full suite, build; archive
  this checklist, update STATUS.
  Verify: `cd app && npm run lint && npm test && npm run build`
