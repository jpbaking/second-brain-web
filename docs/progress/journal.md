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
- 10:04 STARTED m51-02: composer reads/writes chatDefaults in new-chat state
- 10:08 DONE m51-02: composer initialises from profile.chatDefaults in new-chat state and PUTs on any change with no active session; verified by lint/build + Playwright reload probe (model + thinking persisted). 
- 10:08 STARTED m51-03: full verify + archive
- 10:08 DONE m51-03: full verify — lint green, server 367 + web 9 green, build green. Checklist archived.

## 2026-07-12 10:08 — session end
Milestone 51 complete. No active milestone; rebuild needed for 48–51 to go live.
- 10:11 STARTED repair: model menu spans the full composer width
- 10:13 DONE repair: model menu anchored to the composer, spanning its full width (bounding-box asserted ±2px in a Playwright probe + screenshot). Lint/build green.
- 10:22 STARTED milestone 52 (principal go): approval requests must show the tool's intended action (path/command/content preview). Opened checklist; next m52-01.
- 10:23 DONE m52-01: summariseToolInput + detail on approval_request events; verified by `npm test --workspace server -- tool-policy chat-approvals` → 28 green.
- 10:23 STARTED m52-02: approval card shows path/command + collapsible preview
- 10:25 DONE m52-02: approval card shows path/command inline + collapsible content preview; verified by lint/build/web tests + Playwright screenshot.
- 10:25 STARTED m52-03: full verify + archive
- 10:26 DONE m52-03: full verify — lint green, server 371 + web 9 green, build green. Checklist archived.

## 2026-07-12 10:26 — session end
Milestone 52 complete. No active milestone; rebuild needed for 48–52 to go live.
- 10:49 STARTED milestone 53 (principal go): four approval modes Manual/Normal/Auto/Chat with vault-scoped policy matrix + modes menu UI. Next m53-01.
- 10:53 DONE m53-01: mode matrix in evaluateTool + helper predicates + .git guard; verified by `npm test --workspace server -- tool-policy chat-approvals` → 33 green.
- 10:53 STARTED m53-02: schema v16 preset migration, route validation, internal auto sessions, system prompt .git line
- 10:55 DONE m53-02: schema v16 legacy-preset migration, route normalisation, internal sessions → auto, .git line in system prompt; full server suite 376 green.
- 10:55 STARTED m53-03: modes popup menu in the composer
- 10:57 DONE m53-03: modes popup menu (names + descriptions + check, legacy values normalised, chatDefaults compatible); verified by lint/build + Playwright screenshot and mode-switch assertion.
- 10:57 STARTED m53-04: full verify + archive
- 10:58 DONE m53-04: full verify — lint green, server 376 + web 9 green, build green. Checklist archived.

## 2026-07-12 10:58 — session end
Milestone 53 complete. No active milestone; rebuild needed for 48–53 to go live.
- 12:02 STARTED repair: approval modes bypass selected preset for SDK reads, absolute in-vault paths, and tool calls during session start
- 12:04 DONE repair: all vault tools now route through the dynamic mode policy; absolute paths beneath the configured vault stay in-vault; approvals during SDK start use the selected session mode. Verified by focused 36 tests, full lint, server 379 + web 9 tests, and full build.

## 2026-07-12 12:04 — session end
Approval-mode routing repaired. No active milestone; rebuild needed to go live.
- 12:40 STARTED repair: align the app system prompt and hard tool policy with the vault's new AGENTS.md, rule routing, structural invariants, validation, and version-control contract
- 12:44 DONE repair: system prompt now routes through AGENTS.md and task-specific rules/workflows/skills, carries structure/health/commit validation requirements, and the policy strictly guards library moves, Git history/pushes, Manual Git reads, and Chat reasons. Mode UI copy aligned. Verified by full lint, server 381 + web 9 tests, full build, and focused policy/prompt tests.

## 2026-07-12 12:44 — session end
Vault agent contract and approval modes aligned with the current second-brain rules. Rebuild needed to go live.

## 2026-07-12 12:47 — session start
Tree clean at 8cba1f9. Principal go: rendered Markdown tables get one copy
control with HTML and Excel-compatible TSV clipboard formats. Opened milestone
54; next m54-01.
- 12:48 STARTED m54-01: add a single rich/TSV clipboard control to rendered
  Markdown tables.
- 12:50 DONE m54-01: rendered tables have one copy control writing `text/html`
  and Excel-compatible TSV together, with a TSV fallback. Verified by web
  lint and production build.
- 12:50 STARTED m54-02: run the full project gate and archive milestone 54.
- 12:49 DONE m54-02: full gate green — lint clean, server 381 + web 9 tests
  passed, and server + web builds passed. Milestone 54 archived.

## 2026-07-12 12:49 — session end
Milestone 54 complete. Rendered Markdown tables copy as rich HTML and
Excel-compatible TSV from one control; rebuild needed to go live.

## 2026-07-12 12:53 — session start
Tree clean at 59f46f8. Principal go: add the same rich/TSV table copy control
to the expanded table modal. Opened milestone 55; next m55-01.
- 12:53 STARTED m55-01: reuse the table copy component in the expanded modal.
- 12:53 DONE m55-01: expanded tables reuse the rich HTML/TSV copy control
  without reopening the modal. Verified by web lint and production build.
- 12:53 STARTED m55-02: run the full project gate and archive milestone 55.
- 12:54 DONE m55-02: full gate green — lint clean, server 381 + web 9 tests
  passed, and server + web builds passed. Milestone 55 archived.

## 2026-07-12 12:54 — session end
Milestone 55 complete. The expanded table modal now includes the same rich
HTML/Excel-compatible TSV copy control; rebuild needed to go live.

## 2026-07-12 13:00 — session start
Tree clean at ecdbfad. Principal go: add a Copy action below every assistant
message for its raw Markdown response. Opened milestone 56; next m56-01.
- 13:00 STARTED m56-01: add a raw Markdown Copy action below assistant messages.
- 13:00 DONE m56-01: every non-empty assistant message has a labelled Copy
  action for its exact raw Markdown with brief Copied confirmation. Verified
  by web lint and production build.
- 13:00 STARTED m56-02: run the full project gate and archive milestone 56.
- 13:02 DONE m56-02: full gate green — lint clean, server 381 + web 9 tests
  passed, and server + web builds passed. Milestone 56 archived.

## 2026-07-12 13:02 — session end
Milestone 56 complete. Each assistant response now has a bottom Copy action
for its exact raw Markdown; rebuild needed to go live.

## 2026-07-12 13:05 — session start
Tree clean at 0cd3f40. Principal reported the table copy control sits too
close to the header. Opened milestone 57; next m57-01.
- 13:05 STARTED m57-01: move table copy into a spaced action row.
- 13:05 DONE m57-01: table copy sits in a separate right-aligned action row
  with spacing before the table header. Verified by web lint and build.
- 13:05 STARTED m57-02: run the full project gate and archive milestone 57.
- 13:07 DONE m57-02: full gate green — lint clean, server 381 + web 9 tests
  passed, and server + web builds passed. Milestone 57 archived.

## 2026-07-12 13:07 — session end
Milestone 57 complete. Table copy controls now occupy a separate action row
above the table rather than overlapping its header; rebuild needed to go live.

## 2026-07-12 13:10 — session start
Tree clean at fbca669. Principal go: let chat-side Git inherit the deploy key
already used by Save & Sync. Opened milestone 58; next m58-01.
- 13:10 STARTED m58-01: export hardened deploy-key Git environment before Cline starts.
- 13:11 DONE m58-01: agent subprocesses inherit the canonical deploy key via
  the same hardened SSH command as Save & Sync, with terminal prompts disabled.
  Focused regression test 3 green; server build passed.
- 13:11 STARTED m58-02: run the full project gate and archive milestone 58.
- 13:12 DONE m58-02: full gate green — lint clean, server 382 + web 9 tests
  passed, and server + web builds passed. Milestone 58 archived.

## 2026-07-12 13:12 — session end
Milestone 58 complete. Chat-side Git now inherits the canonical deploy key via
the same hardened SSH command as Save & Sync; rebuild needed to go live.

## 2026-07-12 13:17 — session start
Tree clean at 4130f22. Principal go: hide workflow chips; improve slash
autocomplete selection and descriptions; run workflows from a fresh chat.
Opened milestone 59; next m59-01.
- 13:18 STARTED m59-01: expose workflow descriptions from introductory Markdown.
- 13:18 DONE m59-01: workflow API returns sorted names plus descriptions
  derived from each file's first prose paragraph. Workflow suite 5 green.
- 13:19 STARTED m59-02: hide chips, improve autocomplete, and run workflows from fresh chats.
- 13:20 DONE m59-02: workflow chips hidden; autocomplete shows one-line
  descriptions and a strong selected state; fresh-chat selection creates a
  correctly configured session then runs the workflow. Web lint/build passed.
- 13:20 STARTED m59-03: run the full project gate and archive milestone 59.
- 13:21 DONE m59-03: full gate green — lint clean, server 382 + web 9 tests
  passed, and server + web builds passed. Milestone 59 archived.

## 2026-07-12 13:21 — session end
Milestone 59 complete. Workflow chips are hidden; slash autocomplete shows
descriptions and selection; workflows run from fresh chats. Rebuild needed.

## 2026-07-12 13:24 — session start
Tree clean at ff23488. Principal go: make the logo/title lockup consistent on
all pages except chat. Opened milestone 60; next m60-01.
- 13:25 STARTED m60-01: add one branded hero component and migrate non-chat screens.
- 13:26 DONE m60-01: all non-chat screens and setup gates use one branded
  AppHero; titles/taglines preserved and sign-in remains narrow. Web lint and
  production build passed.
- 13:26 STARTED m60-02: run the full project gate and archive milestone 60.
- 13:27 DONE m60-02: full gate green — lint clean, server 382 + web 9 tests
  passed, and server + web builds passed. Milestone 60 archived.

## 2026-07-12 13:27 — session end
Milestone 60 complete. All non-chat pages now share the same branded hero
structure; chat views are unchanged. Rebuild needed to go live.

## 2026-07-12 13:35 — session start
Tree clean at d6305c8. Principal go: Gemini-inspired collapsible sidebar with
primary actions, chat search, and bottom secondary-pages menu. Opened milestone
61; next m61-01.
- 13:36 STARTED m61-01: build collapsible icon-led sidebar and chat-title search.
- 13:40 DONE m61-01: persistent desktop collapse (logo reopens), icon-led New
  chat/Capture/Search chats, and instant recent-title filtering implemented.
  Web lint and production build passed.
- 13:40 STARTED m61-02: validate bottom overflow navigation and mobile drawer behaviour.
- 13:41 DONE m61-02: secondary pages are ordered in an icon-labelled bottom
  overflow beside Sign out; collapsed clicks expand before opening menus; the
  mobile drawer retains its dedicated close control. Web lint/build passed.
- 13:41 STARTED m61-03: run the full project gate and archive milestone 61.
- 13:41 DONE m61-03: full gate green — lint clean, server 382 + web 9 tests
  passed, and server + web builds passed. Milestone 61 archived.

## 2026-07-12 13:41 — session end
Milestone 61 complete. Collapsible icon-led sidebar, chat-title search, and
bottom secondary navigation shipped; rebuild needed to go live.

## 2026-07-12 14:05 — session start
Tree clean at d6b310e. Principal directed five sidebar improvements; opened milestone 62 (sidebar polish). Next: m62-01.
- 14:07 STARTED m62-01: collapsed brand hover swaps logo for open-sidebar icon
- 14:12 DONE m62-01: collapsed brand hover shows open-sidebar icon; verified by build + Playwright probe (1 passed) + screenshots.
- 14:13 STARTED m62-02: New chat/Capture active state follows current path
- 14:14 DONE m62-02: New chat/Capture blue-bold follows current path; Playwright probe green + screenshot. 
- 14:14 STARTED m62-03: chat search over message bodies (server searchSessions + sidebar wiring)
