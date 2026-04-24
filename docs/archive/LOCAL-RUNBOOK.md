# Local runbook

Use this order on a clean machine:

```bash
npm install
npm run setup:env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## What changed in this hotfix

- `db:start` now supports both `docker compose` and legacy `docker-compose`.
- `db:start` waits until PostgreSQL is actually ready before returning.
- `db:migrate` now uses `prisma migrate deploy`, which is deterministic and non-interactive.
- `db:migrate:dev` is still available if you intentionally want Prisma development migration behavior.
- `doctor` runs env setup, database start, Prisma generate, and migration as a single verification command.

## Required runtime

- Node.js 22+
- npm 10+
- Docker Desktop / Docker Engine running
- Port `5432` free, unless you change `docker-compose.yml` and `apps/api/.env`

## If Docker says the container is already using port 5432

Stop the conflicting PostgreSQL instance, or change the exposed port in `docker-compose.yml` and update `DATABASE_URL` / `DIRECT_URL` in `apps/api/.env`.

## If you already have an old broken local database

For local development only:

```bash
npm run local:reset
npm run db:seed
```

This deletes local data.
