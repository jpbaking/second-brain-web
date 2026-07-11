# Milestone 23: Contradiction and Staleness Radar

## Context
Add a radar panel to the Command Centre showing warnings/TODOs and stale projects/people (60+ days without updates). This leverages the existing `vault_search` FTS index.

## Verification
Verification command for backend changes:
`npm test --workspace server -- command-center.test.ts`

## Checklist

- [ ] m23-01: Implement `readRadar(db)` in `app/server/src/search/radar.ts` using `vault_search`.
      Run: `npm test --workspace server -- radar.test.ts`
- [ ] m23-02: Add radar data to `CommandCenterData` and `readCommandCenter`.
      Run: `npm test --workspace server -- command-center.test.ts`
- [ ] m23-03: Render radar data in `CommandCenter.tsx`.
      Run: `npm run lint --workspace web && npm run build --workspace web`
