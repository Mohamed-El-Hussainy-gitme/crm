# Supabase local runbook

## What to put in `apps/api/.env`

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=public"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?schema=public"
APP_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000"
NODE_ENV="development"
PORT="4000"
JWT_SECRET="change-me"
```

## Important

- Do not run `npm run db:start` when using Supabase.
- If you already applied `db/supabase/001_init_schema.sql` in Supabase, do not run `npm run db:migrate` for the first boot.
- Run `npm run db:resolve:baseline` once against the same Supabase database so Prisma records the baseline migration.
- `npm run db:seed` uses `apps/api/.env`. If it still reaches `localhost:5432`, your `DATABASE_URL` is still pointing to localhost or is being overridden.

## Recommended first boot with Supabase

```bash
npm install
npm run setup:env
npm run db:generate
npm run db:resolve:baseline
npm run db:seed
npm run dev
```

## Verify the env file actually used by Prisma

On Windows CMD:

```bat
type apps\api\.env | findstr DATABASE_URL
type apps\api\.env | findstr DIRECT_URL
```

Both commands must show Supabase values, not localhost.
