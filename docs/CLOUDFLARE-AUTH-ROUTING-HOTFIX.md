# Cloudflare auth/routing hotfix

## Fixed

1. Removed the harmful Cloudflare `_redirects` dynamic rules for `/contacts/:id` and `/companies/:id`.
   Those rules can catch generated/static artifacts such as `/contacts/index.txt`, producing URLs like `/contacts/view?id=index.txt`.

2. The login page now verifies that the backend session cookie is actually established by calling `/api/auth/me` immediately after `/api/auth/login`.
   If the cookie was not stored or cannot be read by the backend, login fails instead of leaving a fake local UI session.

3. `AppShell` now redirects unauthenticated users back to `/login?next=...` after the backend session bootstrap completes.
   This prevents protected pages from rendering with stale localStorage state after `/api/auth/me` returns 401.

## After deploying

1. Clear browser site data for the deployed domain.
2. Login again.
3. Confirm `/api/auth/login` returns `Set-Cookie: smartcrm_session=...`.
4. Confirm `/api/auth/me` returns 200.
