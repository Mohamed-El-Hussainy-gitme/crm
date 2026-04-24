# Hybrid CRM Hotfix + Supabase Bootstrap

## Included fixes

- `/api/auth/me` no longer fails with `400` when the browser has no bearer token.
- API authentication now validates either the HttpOnly cookie session or a bearer token manually and returns `401` for missing/expired sessions.
- `middleware.ts` was renamed to `proxy.ts` for Next.js 16 compatibility.
- Prisma datasource now supports `DIRECT_URL` for CLI migrations.
- `db:seed` no longer uses `prisma db push`; it now respects the migration-first workflow.
- Local `.env` files were removed from the distributed archive.
- `.npmrc` was added to force the public npm registry.
- A separate `db/supabase/` directory was added so the schema can be applied directly in Supabase SQL Editor.

## Files for Supabase

- `db/supabase/001_init_schema.sql`
- `db/supabase/002_seed_admin.sql`
