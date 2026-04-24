# Cloudflare Fullstack Phase 4

## Result

The CRM is now wired as a Cloudflare-native fullstack application:

```txt
apps/web static UI
  -> /api/*
  -> functions/api/[[path]].ts
  -> packages/backend TypeScript business logic
  -> Supabase PostgREST/Auth
```

The legacy Fastify API is no longer part of the primary build or dev path.

## Converted modules

These modules now run through `packages/backend`:

- auth/session
- contacts
- companies
- tasks
- follow-ups
- calls
- payments
- deals
- reports/export
- agenda
- notifications
- intelligence
- WhatsApp conversations/templates/webhook logging
- broadcasts/audience/delivery inspection
- settings
- audit logs
- data tools/import/duplicates
- automations
- storage status

## Important behavior

- Frontend calls same-origin `/api/*` only.
- Business rules live in TypeScript backend services/routes.
- Supabase is used as the hosted database and auth provider.
- Local SQLite backup/restore has been disabled in the Cloudflare architecture. Use Supabase backups/PITR.
- `LEGACY_API_URL` has been removed from the runtime contract.

## Main commands

```bash
npm run cf:build
npm run cf:dev
npm run cf:deploy
```

Legacy development is still available temporarily:

```bash
npm run dev:legacy
npm run build:legacy
```

## Required Cloudflare variables

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=
CORS_ORIGINS=
SESSION_SECRET=
SESSION_COOKIE_NAME=smartcrm_session
SESSION_COOKIE_DOMAIN=
SESSION_MAX_AGE_SECONDS=43200
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Production check

After deploy:

```txt
/api/health
/api/auth/me
/api/contacts
/api/reports/overview
/api/notifications
```

Expected result: no request should go to `127.0.0.1:4000`, and unknown API routes should return `404 Route not found` instead of proxying to the legacy API.
