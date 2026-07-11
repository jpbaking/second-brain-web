# Milestone 27: Principal Profile

## Objective
Provide a private settings area for working preferences (Principal Profile) to fulfil the backlog item from phase-008.

## Checklist

- [x] m27-01: Create migration 12 in `app/server/src/migrations.ts` to add `principal_profile` table (`id` TEXT PRIMARY KEY CHECK(id = 'default'), `preferences_json` TEXT NOT NULL, `updated_at` TEXT NOT NULL).
      Run: `npm test --workspace server -- migrations.test.ts`
- [x] m27-02: Add `app/server/src/profile/store.ts` with `getProfile` and `updateProfile` functions.
      Run: `npm test --workspace server`
- [ ] m27-03: Add `/api/profile` GET and PUT routes in `app/server/src/profile/routes.ts` (and register in `app.ts`).
      Run: `npm test --workspace server`
- [ ] m27-04: Create `app/web/src/ProfileScreen.tsx` to view and edit preferences (Default report style, Timezone, Work week). Add to `/profile` route and `AppShell.tsx` navigation.
      Run: `npm run lint && npm run build`
