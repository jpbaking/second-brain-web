# Milestone 50 — Composer model menu (thinking + effort)

Principal request (2026-07-12): drop the "Default provider" placeholder — the
composer must always show the actual active model — and replace the plain
provider `<select>` with a Claude-VSCode-style popup menu: model switching as
a submenu, plus a Thinking toggle and an Effort selector when the model
supports them.

SDK findings: `CoreModelConfig` takes `thinking?: boolean` and
`reasoningEffort?` (`none|minimal|low|medium|high|xhigh`,
`@cline/shared/dist/llms/reasoning-effort`). Capability detection via
`getGeneratedModelsForProvider()` from `@cline/llms`: `ModelInfo.capabilities`
includes `reasoning` / `reasoning-effort`. Catalog covers `anthropic`,
`gemini`, `openai-native`; `claude-code` resolves against the `anthropic`
catalog (same model ids); `openai-compatible` (LM Studio) is uncatalogued —
treat capabilities as unknown and still offer the controls.

- [x] **m50-01** Server: expose per-profile model capabilities. Extend the
  `/api/providers` profile payload with `modelId` and
  `reasoning: { supported: boolean | null, effort: boolean | null }` (null =
  unknown/uncatalogued) resolved from the generated catalog (claude-code →
  anthropic lookup).
  Verify: `cd app && npm test --workspace server -- provider-api.test.ts`
- [x] **m50-02** Server: persist `thinking` (bool) and `reasoningEffort`
  (enum) per chat session — schema v15 columns on `chat_sessions`, accepted by
  `PATCH /api/chat/sessions/:id`, returned by session GET/list, and passed
  into the SDK model config at (re)start.
  Verify: `cd app && npm test --workspace server -- chat-api.test.ts agent-session.test.ts migrations.test.ts`
- [x] **m50-03** Web: composer popup menu replacing the provider select —
  trigger shows the active model (default profile resolved by name, never
  "Default provider"); menu contains a model submenu (enabled profiles),
  a Thinking toggle and an Effort selector (shown when supported or unknown,
  hidden when the catalog says unsupported), wired to the PATCH endpoint.
  Approvals select stays.
  Verify: `cd app && npm run lint && npm run build` + Playwright screenshot
- [x] **m50-04** Full verify + archive: lint, full suite, build; screenshot
  evidence; archive this checklist, update STATUS.
  Verify: `cd app && npm run lint && npm test && npm run build`
