# Phase 7B — Scheduler Redesign

Implemented in this project revision:

- Rich scheduling metadata on tasks:
  - `WHATSAPP` task type
  - `hasExactTime`
  - `durationMins`
  - `completionResult`
- Planner-oriented backend overview with buckets:
  - overdue
  - today
  - tomorrow
  - thisWeek
  - unscheduled
  - paymentAlerts
- Contact-level scheduled follow-up support for orphan `nextFollowUpAt` items, without duplicating task events in the calendar.
- Reschedule workflow endpoints:
  - `PATCH /api/tasks/:id/reschedule`
  - `PATCH /api/contacts/:id/next-follow-up`
- Completion workflow endpoints with result capture:
  - `PATCH /api/tasks/:id/complete`
  - `PATCH /api/tasks/:id/status`
  - `POST /api/contacts/:id/next-follow-up/complete`
- New day/week agenda payload and UI timeline.
- New follow-up center and today planner based on the managed schedule model.
- Shared workflow helpers fixed and completed:
  - `requiresContactTouch`
  - `touchContact`
  - `syncContactNextFollowUp`

## Migration

Apply the new Prisma migration after unzipping:

- `apps/api/prisma/migrations/20260423232000_phase7b_scheduler/migration.sql`

## Notes

This revision was syntax-checked via TypeScript transpilation for the modified TypeScript/TSX files.
A full install/build/runtime verification was not completed inside this environment because the workspace dependencies are not installed in-container.
