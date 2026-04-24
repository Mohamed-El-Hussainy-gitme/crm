# Cloudflare Session Cookie Hotfix

## Problem

`/api/auth/login` can return `200` with a valid user payload while the next request to `/api/auth/me` returns:

```json
{"message":"Unauthorized"}
```

That means login succeeded, but the browser did not persist or resend `smartcrm_session`.

The most common cause on Cloudflare Pages preview domains is an invalid `SESSION_COOKIE_DOMAIN`, especially values such as:

- `pages.dev`
- `.pages.dev`
- `https://crm-xxxx.pages.dev`
- a domain that does not match the current hostname

Browsers silently reject those cookies.

## Fix

The backend now sanitizes `SESSION_COOKIE_DOMAIN` and omits the `Domain` attribute when it is invalid, unsafe, a public Cloudflare suffix, equal to the current hostname, or not related to the current hostname.

For Cloudflare Pages preview domains, leave `SESSION_COOKIE_DOMAIN` empty.

Correct configuration for `*.pages.dev`:

```env
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_NAME=smartcrm_session
SESSION_MAX_AGE_SECONDS=43200
```

For a custom domain like `crm.example.com`, usually also leave it empty. Only use this when cookie sharing across subdomains is required:

```env
SESSION_COOKIE_DOMAIN=example.com
```

## Verification

After deploy:

1. Clear site data in Chrome DevTools.
2. Login again.
3. Inspect `POST /api/auth/login`.
4. Confirm the response contains:

```txt
Set-Cookie: smartcrm_session=...; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax
```

5. Confirm the next request returns `200`:

```txt
GET /api/auth/me
```
