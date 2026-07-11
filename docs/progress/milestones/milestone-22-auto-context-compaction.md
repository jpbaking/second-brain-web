# Milestone 22: Automatic Context Compaction

## Context

Manual context compaction is already implemented (milestone 5B). We need to trigger it automatically based on transcript size to prevent long-running sessions from degrading or hitting token limits.

## Verification

Verification command for backend changes:
`npm test --workspace server -- session.test.ts`

## Checklist

- [ ] m22-01: Define transcript size threshold and calculate size in `session.ts`.
      Run: `npm test --workspace server -- session.test.ts`
- [ ] m22-02: Add automatic trigger logic when a turn ends to call `compactSession` if the threshold is exceeded.
      Run: `npm test --workspace server -- session.test.ts`
- [ ] m22-03: Write tests for automatic compaction triggers in `session.test.ts`.
      Run: `npm test --workspace server -- session.test.ts`
