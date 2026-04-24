# Smart CRM monorepo

This workspace contains the Smart CRM web app, API, and shared package.

## Workspace layout

- `apps/web` — Next.js application
- `apps/api` — Fastify API + Prisma
- `packages/shared` — shared contracts and types
- `db/supabase` — Supabase SQL bootstrap files
- `docs` — active project documentation
- `docs/archive` — historical phase notes and interim reports

## Requirements

- Node.js 22 LTS
- npm 10+
- One database profile:
  - local PostgreSQL via Docker, or
  - external PostgreSQL / Supabase

## Quick start

Install dependencies:

```bash
npm install
npm run setup:env
```

### Option A — local PostgreSQL

```bash
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

### Option B — Supabase / external PostgreSQL

1. Set `apps/api/.env` with `DATABASE_URL` and `DIRECT_URL`.
2. Apply `db/supabase/001_init_schema.sql`.
3. Optionally apply `db/supabase/002_seed_admin.sql`.
4. Mark the Prisma baseline once:

```bash
npm run db:generate
npm run db:resolve:baseline
npm run db:seed
npm run dev
```

## Default local login

- `admin@smartcrm.local`
- `Admin123!`

## Useful commands

```bash
npm run dev
npm run build
npm run test
npm run clean
```

## Primary docs

- `docs/ENVIRONMENT.md`
- `docs/LOCAL-TESTING.md`
- `docs/SUPABASE.md`

## Notes

- Generated build artifacts such as `apps/api/dist`, `packages/shared/dist`, and `apps/web/.next` are intentionally excluded from this cleaned project snapshot.
- Rotate any local secrets before sharing this project outside your machine.
