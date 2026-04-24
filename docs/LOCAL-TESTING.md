# Local testing checklist

## First-time setup

```bash
npm install
npm run setup:env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Start the stack

You can run the full workspace from the root:

```bash
npm run dev
```

If you need isolated troubleshooting, run the API and web app in separate terminals:

```bash
npm run dev --workspace @smartcrm/api
npm run dev --workspace @smartcrm/web
```

## Build + tests before shipping

```bash
npm run local:verify
```

## Manual smoke test

1. Open `http://localhost:3000/login`
2. Sign in with `admin@smartcrm.local` / `Admin123!`
3. Visit `/today`, `/contacts`, `/pipeline`, `/tasks`, `/messages`, `/reports`
4. Check `http://localhost:4000/health` and `http://localhost:4000/health/ready`

## Supabase smoke test

1. Apply `db/supabase/001_init_schema.sql` in Supabase SQL Editor
2. Apply `db/supabase/002_seed_admin.sql`
3. Set `apps/api/.env` with your Supabase `DATABASE_URL` and `DIRECT_URL`
4. Run `npm run db:generate`
5. Run `npm run db:resolve:baseline` once
6. Run `npm run dev`


## Browser API base URL

For same-machine development, prefer `apps/web/.env.local` with:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api
```
