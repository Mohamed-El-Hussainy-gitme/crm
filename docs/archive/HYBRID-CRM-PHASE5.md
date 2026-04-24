# Hybrid CRM - Phase 5

Phase 5 pushes the hybrid CRM closer to a production workflow baseline.

## What changed

### 1. Route guards
- Added Next.js route protection through `apps/web/middleware.ts`
- Unauthenticated users are redirected to `/login`
- Authenticated users are redirected away from `/login` to `/today`
- Added role-based page guard component for privileged screens
  - `storage` => `ADMIN`
  - `data-tools` => `SALES_MANAGER`

### 2. Reusable validation layer
- Expanded `@smartcrm/shared` schemas to cover:
  - login
  - follow-ups
  - notes
  - calls
  - deals
  - payments
  - stage updates
  - task primitives
- Added `apps/web/lib/forms.ts` for normalized client-side schema validation
- Connected validation to key workflows:
  - login
  - contact creation
  - task creation
  - follow-up drawers
  - contact 360 note/call/task/deal/payment actions
  - message-driven follow-up creation

### 3. Cached query layer and invalidation
- Extended `apps/web/lib/query.ts` with:
  - cache keys
  - TTL-based cache reads
  - cache invalidation broadcasts
- Applied cached queries to:
  - Today
  - Tasks
  - Reports
  - Settings
- Added invalidation after workflow mutations so Today/Tasks stay synchronized

### 4. Pagination pass
- Added reusable pagination controls
- Applied pagination to:
  - Contacts
  - Tasks
  - Messages conversation list

### 5. Contact timeline normalization
- Added `apps/web/lib/timeline.ts`
- Contact 360 now builds a single normalized activity stream from:
  - notes
  - calls
  - tasks
  - payments
  - deals
  - generic activities

### 6. Session hardening
- Session storage now also writes a cookie for route protection
- Provider bootstrap now refreshes `/auth/me` on load when a stored session exists
- Unauthorized API responses clear both local storage and cookie state

### 7. Test baseline
- Added `apps/web/tests/phase5.test.ts`
- Covered:
  - validation helper behavior
  - follow-up schema acceptance
  - normalized timeline merge/order behavior

## Verification

### Confirmed
- `@smartcrm/shared` build passes
- `@smartcrm/web` tests pass
- `@smartcrm/web` production build passes in this environment

### Not fully confirmed in this environment
- `@smartcrm/api` full build still depends on Prisma CLI / generated client availability in the workspace environment.
- Phase 5 backend source changes were limited and kept compatible with the current structure, but full API build verification was blocked by missing Prisma tooling in the local container workspace.
