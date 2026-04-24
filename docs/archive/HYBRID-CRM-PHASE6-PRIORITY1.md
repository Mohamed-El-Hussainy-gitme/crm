# Hybrid CRM Phase 6 - Priority 1

## Goal
Harden authentication and session handling before broader production work.

## What changed
- Replaced browser-stored JWT auth with **HttpOnly cookie sessions**.
- Added **trusted-origin enforcement** for cookie-authenticated mutation requests.
- Added **proxy-aware Fastify configuration** for future Cloudflare or reverse-proxy deployment.
- Added `/api/auth/logout` and normalized `/api/auth/me` and `/api/auth/login` responses.
- Updated the web app to restore authenticated state from the backend instead of decoding tokens in the browser.

## Security impact
- Auth tokens are no longer stored in `localStorage`.
- Session cookies use:
  - `HttpOnly`
  - `SameSite=Lax`
  - `Secure` in production or when explicitly enabled
  - optional shared `domain` support for multi-subdomain deployment
- Cookie-authenticated POST/PATCH/DELETE requests reject untrusted origins.

## Cloudflare preparation
When deploying behind Cloudflare later:
1. Keep the web app and API under the same parent domain when possible.
2. Set:
   - `TRUST_PROXY=true`
   - `SESSION_COOKIE_SECURE=true`
   - `SESSION_COOKIE_DOMAIN=.your-domain.com`
   - `APP_URL=https://app.your-domain.com`
   - `CORS_ORIGINS=https://app.your-domain.com`
3. Prefer Full (strict) TLS between Cloudflare and origin.
4. Keep the API origin private where possible and expose only the app origin publicly.

## Notes
This pass does **not** add refresh-token rotation yet. It focuses on removing token exposure from the browser and preparing the system for a safer production edge deployment.
