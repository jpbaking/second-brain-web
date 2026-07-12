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
