# Cloudflare Fullstack Migration - Phase 3

## Scope

Phase 3 moves the CRM core modules from the legacy Fastify runtime into the Cloudflare Pages Functions backend skeleton introduced in phases 1 and 2.

Converted modules:

- Contacts
- Companies
- Tasks
- Follow-ups / planner overview
- Contact notes as part of contact details workflow

The frontend continues to call same-origin API paths such as `/api/contacts` and `/api/follow-ups/overview`. These routes are now handled by `packages/backend` before the transitional `LEGACY_API_URL` proxy is used.

## New backend files

```txt
packages/backend/src/db/postgrest.ts
packages/backend/src/core/types.ts
packages/backend/src/core/utils.ts
packages/backend/src/core/repository.ts
packages/backend/src/contacts/routes.ts
packages/backend/src/contacts/service.ts
packages/backend/src/companies/routes.ts
packages/backend/src/companies/service.ts
packages/backend/src/tasks/routes.ts
packages/backend/src/tasks/service.ts
packages/backend/src/followups/routes.ts
packages/backend/src/followups/service.ts
```

## Fullstack behavior after Phase 3

```txt
Browser
  -> /api/contacts
  -> Cloudflare Pages Function
  -> packages/backend route
  -> service-layer validation/auth/business logic
  -> Supabase REST/PostgREST
  -> DTO response for UI
```

The frontend no longer needs `NEXT_PUBLIC_API_URL`. It uses `/api/*` only.

## Converted API routes

### Contacts

```txt
GET   /api/contacts
POST  /api/contacts
GET   /api/contacts/:id
PATCH /api/contacts/:id
POST  /api/contacts/:id/stage
POST  /api/contacts/:id/notes
POST  /api/contacts/bulk/stage
POST  /api/contacts/bulk/tags
POST  /api/contacts/intake/parse-location
```

### Companies

```txt
GET   /api/companies
POST  /api/companies
GET   /api/companies/:id
PATCH /api/companies/:id
```

### Tasks

```txt
GET   /api/tasks
POST  /api/tasks
PATCH /api/tasks/:id/complete
PATCH /api/tasks/:id/reschedule
PATCH /api/tasks/:id/status
```

### Follow-ups

```txt
GET   /api/follow-ups/overview
POST  /api/contacts/:id/follow-ups
PATCH /api/contacts/:id/next-follow-up
POST  /api/contacts/:id/next-follow-up/complete
```

## Intentional design rules

- Business logic lives in TypeScript services.
- Supabase is accessed only by the backend using server-side environment variables.
- Supabase/Postgres is used for storage, constraints, indexes, and relational consistency.
- Frontend code receives DTOs and does not make database decisions.
- Legacy Fastify remains available through `LEGACY_API_URL` only for routes not converted yet.

## Required environment variables

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
APP_URL=
CORS_ORIGINS=
SESSION_COOKIE_NAME=smartcrm_session
SESSION_MAX_AGE_SECONDS=43200
LEGACY_API_URL=http://127.0.0.1:4000/api
```

`LEGACY_API_URL` is still optional, but useful while remaining non-core modules are migrated in Phase 4.

## Verification checklist

```txt
/api/health
/api/auth/me
/api/contacts
/api/companies
/api/tasks
/api/follow-ups/overview
```

The core CRM screens should not request `127.0.0.1:4000` anymore when running through Cloudflare Pages Functions.
