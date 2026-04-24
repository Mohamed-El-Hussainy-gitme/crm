# Supabase bootstrap

## Files to apply

Run these files in Supabase SQL Editor in this order:

1. `db/supabase/001_init_schema.sql`
2. `db/supabase/002_seed_admin.sql` (optional but recommended for first login)
3. `npm run db:resolve:baseline` once against the same database so Prisma records the initial migration history

## Runtime envs

Set these values in `apps/api/.env` or your deployment secrets:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
APP_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000"
```

## Local app against Supabase

```bash
npm install
npm run setup:env
npm run db:generate
npm run dev
```

If you already applied the SQL files manually in Supabase, you do not need to run `npm run db:migrate` locally against that database before the first boot, but you should still run `npm run db:resolve:baseline` once so Prisma stores the baseline in `_prisma_migrations`.

## Default seeded admin

- email: `admin@smartcrm.local`
- password: `Admin123!`
