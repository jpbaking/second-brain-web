# Milestone 25: Backup / Restore UI

## Objective
Provide an operational Backup / Restore UI that lets the principal securely download database snapshots and view system state, fulfilling the "Backup/Restore UI" backlog item.

## Checklist

- [x] m25-01: Add `GET /api/backup/:db` endpoint to `app/server/src/db/routes.ts` (or `app/server/src/vault/routes.ts` or new `system` routes). It should use `node:sqlite`'s `db.serialize()` to return a consistent snapshot of either the `core` or `sidecar` database.
      Run: `npm test --workspace server`
- [x] m25-02: Create `app/web/src/BackupScreen.tsx` that displays the operational status (using data from `/api/status`) and provides buttons to download the Core and Sidecar backups.
      Run: `npm run lint --workspace web`
- [x] m25-03: Register `/backup` in `App.tsx` and add a "System Backup" link to the `AppShell.tsx` navigation sidebar.
      Run: `npm run build --workspace web`
