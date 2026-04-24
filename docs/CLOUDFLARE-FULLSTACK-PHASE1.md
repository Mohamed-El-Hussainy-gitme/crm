# Cloudflare Fullstack Phase 1

This phase establishes the Cloudflare-native fullstack skeleton without completing the CRM module migration yet.

## Target behavior

```text
Browser -> /api/* -> Cloudflare Pages Function -> packages/backend -> Supabase later
```

The frontend no longer points to `NEXT_PUBLIC_API_URL`. All frontend API calls use same-origin `/api/*`.

## Added structure

```text
functions/api/[[path]].ts
packages/backend/src/app.ts
packages/backend/src/common/*
packages/backend/src/db/supabase.ts
packages/backend/src/health/routes.ts
```

## Implemented routes

```text
GET /api/health
GET /api/health/live
GET /api/health/ready
```

Unconverted routes return `501` unless `LEGACY_API_URL` is configured. During migration, this lets the Cloudflare function proxy unconverted routes to the old Fastify API while the frontend still calls `/api/*`.

## Static web preparation

`apps/web/next.config.ts` now uses:

```ts
output: "export"
```

Dynamic contact/company detail screens were moved to query-based static routes:

```text
/contacts/view?id=<contactId>
/companies/view?id=<companyId>
```

Legacy URL redirects are defined in:

```text
apps/web/public/_redirects
```

## Build commands

```bash
npm run cf:build
npm run cf:verify
```

## Phase 1 boundaries

Completed:

- Cloudflare Pages Functions API gateway.
- Backend package skeleton.
- Health endpoint.
- Same-origin frontend API client.
- Static export configuration for the web app.
- Transition proxy support via `LEGACY_API_URL`.

Not completed in Phase 1:

- Auth migration.
- CRM module migration.
- Supabase runtime client implementation.
- Removal of `apps/api`.

Those belong to phases 2 and 3.
