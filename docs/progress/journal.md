# Journal — append-only work log

Older entries (project start → 2026-07-12, milestones 0–49) are preserved
verbatim in `journal-archive-2026-07.md`. Same rules apply here: append only,
never edit or delete past entries.

## 2026-07-12 — journal rotated
Rotated the journal (1,100+ lines) into `journal-archive-2026-07.md` at the
principal's request, together with a STATUS rewrite, BACKLOG completed-entry
collapse, and archiving the fully-ticked milestone-37 checklist.
- 09:09 DONE trim: STATUS 72→52 lines, BACKLOG 205→~66 lines (completed items one-line), journal rotated, milestone-37 checklist archived. Session end; await direction.
- 09:12 STARTED repair: restyle composer as a single rounded container (input on top, controls bar below — Claude-style layout, lazyway tokens)
- 09:15 DONE repair: composer restyled as one rounded container (borderless input on top; bar below with paperclip left, provider/approvals + round arrow send right; icon abort). Verified by lint/build + Playwright screenshots (1-line and 4-line states). Removed throwaway probe spec.
- 09:37 STARTED milestone 50 (principal go): composer model menu — real model name, model submenu, thinking toggle + effort selector (SDK: CoreModelConfig.thinking/reasoningEffort; capabilities via @cline/llms generated catalog). Opened checklist, next m50-01.
- 09:37 STARTED m50-01: per-profile model capabilities on /api/providers
- 09:39 DONE m50-01: /api/providers profiles now carry modelId + reasoning capabilities from the generated catalog; verified by `npm test --workspace server -- provider-api.test.ts` → 4 green.
- 09:39 STARTED m50-02: persist thinking/reasoningEffort per session (schema v15), PATCH + SDK start config
- 09:42 DONE m50-02: schema v15 thinking/reasoning_effort columns, PATCH accepts + validates, start config carries them to the SDK; verified by `npm test --workspace server -- chat-api agent-session migrations` → 22 green.
- 09:42 STARTED m50-03: composer model menu UI (model submenu, thinking toggle, effort selector; no Default provider placeholder)
- 09:45 DONE m50-03: composer model menu (trigger = real model name, switch-model submenu, thinking switch + ✦ marker, effort slider gated by catalog capability); verified by lint/build + Playwright screenshots.
- 09:45 STARTED m50-04: full verify + archive
- 09:46 DONE m50-04: full verify — lint green, server 366 + web 9 green (status/migrations tests bumped to schema v15), build green. Checklist archived.

## 2026-07-12 09:46 — session end
Milestone 50 complete. No active milestone; await direction. Rebuild needed
for 48–50 to go live.

## 2026-07-12 10:03 — session start (continued conversation)
Principal go: new-chat composer settings become defaults for future new chats.
Opened milestone 51 (chatDefaults in principal profile prefs). Next m51-01.
- 10:03 STARTED m51-01: chatDefaults on PrincipalProfile + API round-trip test
- 10:04 DONE m51-01: chatDefaults on PrincipalProfile; verified by `npm test --workspace server -- profile-api.test.ts` → 3 green.
