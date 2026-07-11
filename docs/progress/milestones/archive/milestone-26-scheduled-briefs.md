# Milestone 26: Scheduled Briefs

## Objective
Provide background cron-like execution of agent workflows (e.g., daily briefs, stale project sweeps) to fulfil the Scheduled Briefs backlog item.

## Checklist

- [x] m26-01: Create migration 11 in `app/server/src/migrations.ts` to add `scheduled_jobs` table (`id`, `name`, `workflow`, `frequency`, `last_run_at`, `created_at`).
      Run: `npm test --workspace server -- migrations.test.ts`
- [x] m26-02: Add `/api/schedules` CRUD routes in `app/server/src/agent/schedule-routes.ts` (and register in `app.ts`).
      Run: `npm test --workspace server`
- [x] m26-03: Add `SchedulerService` in `app/server/src/agent/scheduler.ts` that polls every minute and kicks off agent sessions for jobs that are due based on their `frequency`, using `expandWorkflow`. Instantiate it in `app.ts` and ensure it shuts down cleanly.
      Run: `npm test --workspace server`
- [x] m26-04: Create `app/web/src/SchedulesScreen.tsx` to list, create, and delete scheduled jobs. Add to `/schedules` route and `AppShell.tsx` navigation.
      Run: `npm run lint && npm run build`
