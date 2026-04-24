# Environment variables

## Local development

### apps/api/.env

| Variable | Required | Local default | Notes |
|---|---|---:|---|
| `NODE_ENV` | yes | `development` | runtime mode |
| `PORT` | yes | `4000` | Fastify port |
| `LOG_LEVEL` | yes | `info` | pino level |
| `DATABASE_URL` | yes | `postgresql://smartcrm:smartcrm@localhost:5432/smartcrm?schema=public` | runtime PostgreSQL connection string |
| `DIRECT_URL` | recommended | `postgresql://smartcrm:smartcrm@localhost:5432/smartcrm?schema=public` | direct connection for Prisma CLI migrations |
| `JWT_SECRET` | yes | `smartcrm-local-secret-123456` | session signing secret; change in non-local environments |
| `APP_URL` | yes | `http://127.0.0.1:3000` | primary local app origin; include localhost in `CORS_ORIGINS` if you use it |
| `CORS_ORIGINS` | optional | `http://127.0.0.1:3000,http://localhost:3000` | comma-separated allowed origins |
| `TRUST_PROXY` | yes | `false` | set `true` behind Cloudflare / reverse proxy |
| `SESSION_COOKIE_NAME` | yes | `smartcrm_session` | HttpOnly session cookie name |
| `SESSION_COOKIE_DOMAIN` | optional | empty | set parent domain later for prod, e.g. `.example.com` |
| `SESSION_COOKIE_SECURE` | yes | `false` | set `true` in HTTPS environments |
| `SESSION_MAX_AGE_SECONDS` | yes | `43200` | 12 hours |
| `SESSION_JWT_EXPIRES_IN` | yes | `12h` | signing window for server session token |
| `WHATSAPP_PROVIDER` | yes | `DEEP_LINK` | use `CLOUD_API` only when real credentials exist |
| `WHATSAPP_ACCESS_TOKEN` | optional | empty | required only for Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | optional | empty | required only for Cloud API |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | optional | empty | required only for Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | optional | empty | required only for webhook verification |
| `WHATSAPP_API_VERSION` | yes | `v23.0` | Meta API version |

### apps/web/.env.local

| Variable | Required | Local default | Notes |
|---|---|---:|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://127.0.0.1:4000/api` | browser-visible API base URL; use your LAN IP instead when testing from another device |

## Supabase profile

Use two connection strings when you want Prisma migrations and runtime traffic to stay separate:

- `DATABASE_URL` for runtime traffic
- `DIRECT_URL` for Prisma CLI / migrations

Example placeholders:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
```

## Staging / production additions

These values normally change outside local development:

- `NODE_ENV=production`
- `APP_URL=https://app.example.com`
- `CORS_ORIGINS=https://app.example.com`
- `TRUST_PROXY=true`
- `SESSION_COOKIE_DOMAIN=.example.com`
- `SESSION_COOKIE_SECURE=true`
- strong `JWT_SECRET`
- managed PostgreSQL `DATABASE_URL`
- direct migration connection in `DIRECT_URL`


## Local connectivity note

If the browser reports `ERR_CONNECTION_REFUSED` against `localhost:4000` while the API is running, set `NEXT_PUBLIC_API_URL` to `http://127.0.0.1:4000/api` and restart the Next.js dev server.
