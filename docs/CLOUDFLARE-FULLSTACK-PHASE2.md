# Cloudflare Fullstack Phase 2

This phase migrates authentication/session behavior from the old Fastify runtime into the Cloudflare-native backend introduced in Phase 1.

## Target behavior

```text
Browser -> /api/auth/* -> Cloudflare Pages Function -> packages/backend/auth -> Supabase Auth + public.User
```

The frontend still does not talk to Supabase directly. It only calls same-origin `/api/*`.

## Implemented routes

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

Unconverted non-auth routes still fall through to `LEGACY_API_URL` when configured.

## Auth flow

```text
POST /api/auth/login
  -> validate email/password
  -> call Supabase Auth password grant
  -> load the CRM profile from public."User" by email
  -> sign an httpOnly cookie using HMAC-SHA256
  -> return normalized user DTO
```

The browser receives only the user DTO. The session token is stored in an httpOnly cookie and is not exposed to JavaScript.

## Session cookie

Default cookie name:

```text
smartcrm_session
```

Cookie protections:

```text
HttpOnly
SameSite=Lax
Secure when deployed over HTTPS
Path=/
HMAC-SHA256 signed payload
```

The signed payload contains only identity and role data required by the backend:

```ts
type SessionPayload = {
  version: 1;
  user: {
    id: string;        // CRM public.User.id
    authUserId?: string; // Supabase Auth user id
    fullName: string;
    email: string;
    role: "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";
  };
  issuedAt: number;
  expiresAt: number;
};
```

No JWT or Supabase access token is written to localStorage.

## Required Supabase setup

A Supabase Auth user must exist for the login email.

A matching CRM profile must also exist in:

```text
public."User"
```

The Phase 2 backend links Supabase Auth to the existing CRM schema by email, not by id, so the existing `public."User".id` CUID relationships can continue working during the migration.

Required profile fields:

```text
id
fullName
email
role
```

## Runtime variables

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
APP_URL="https://your-crm-domain.com"
CORS_ORIGINS="https://your-crm-domain.com"
SESSION_SECRET="strong-random-secret"
SESSION_COOKIE_NAME="smartcrm_session"
SESSION_COOKIE_DOMAIN=""
SESSION_MAX_AGE_SECONDS="43200"
LEGACY_API_URL="http://127.0.0.1:4000/api"
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist in Cloudflare runtime secrets/env. It must never be prefixed with `NEXT_PUBLIC_`.

## Added structure

```text
packages/backend/src/auth/
  routes.ts
  service.ts
  session.ts
  types.ts

packages/backend/src/db/
  supabase-rest.ts

packages/backend/src/common/
  cookies.ts
```

## Frontend behavior

`apps/web/lib/api.ts` continues to call same-origin `/api/*`.

`apps/web/app/login/page.tsx` still calls:

```ts
apiFetch("/auth/login")
```

`components/providers.tsx` still calls:

```ts
apiFetch("/auth/me")
apiFetch("/auth/logout")
```

Those calls now hit the Cloudflare backend instead of the legacy API.

## Phase 2 boundaries

Completed:

- Backend auth routes.
- Supabase Auth password login through backend.
- CRM profile lookup through backend.
- Signed httpOnly session cookie.
- `/auth/me` session verification and profile refresh.
- `/auth/logout` cookie clearing.
- Session cookie utilities and tests.

Not completed in Phase 2:

- Contacts migration.
- Companies migration.
- Tasks migration.
- Follow-up/report migration.
- Removal of `apps/api`.

Those belong to phases 3 and 4.
