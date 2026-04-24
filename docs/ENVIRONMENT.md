# Environment variables

The Cloudflare fullstack target uses same-origin `/api/*` requests. The frontend no longer needs `NEXT_PUBLIC_API_URL`.

## Cloudflare Pages Functions

Set these in Cloudflare Pages project settings:

| Variable | Required | Notes |
|---|---:|---|
| `SUPABASE_URL` | yes | Supabase project URL. |
| `SUPABASE_ANON_KEY` | yes | Used by backend auth calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Backend-only key for database access through PostgREST. Never expose this to the browser. |
| `APP_URL` | yes | Canonical app origin, for example `https://crm.example.com`. |
| `CORS_ORIGINS` | yes | Comma-separated trusted origins. Include preview/local origins when needed. |
| `SESSION_SECRET` | yes | At least 32 random bytes. Example: `openssl rand -base64 48`. |
| `SESSION_COOKIE_NAME` | no | Defaults to `smartcrm_session`. |
| `SESSION_COOKIE_DOMAIN` | no | Use a parent domain only when needed. |
| `SESSION_MAX_AGE_SECONDS` | no | Defaults to 43200. |

## Local Cloudflare preview

Use `.dev.vars` or environment variables with:

```bash
npm run cf:dev
```

The app should be opened through Wrangler's Pages dev URL, normally `http://localhost:8788`.

## Legacy API

`apps/api` remains in the repository temporarily as legacy source/reference code. It is not part of the Cloudflare build path.

Use legacy scripts only when explicitly debugging the old runtime:

```bash
npm run dev:legacy
npm run build:legacy
```
