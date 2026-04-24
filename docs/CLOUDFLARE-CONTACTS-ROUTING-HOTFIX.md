# Cloudflare Contacts Routing Hotfix

## Issue

After successful login, the Contacts page could display:

```json
{"message":"Contact id is required"}
```

This happened when `GET /api/contacts` was evaluated by a shared `/contacts/:id/follow-ups` route handler before the main contacts route.

## Fix

`packages/backend/src/followups/routes.ts` now verifies the full nested mutation pattern before reading `pathSegments[1]` as a contact id.

This allows:

- `GET /api/contacts` to reach the contacts list handler.
- `POST /api/contacts/:id/follow-ups` to keep working.
- `PATCH /api/contacts/:id/next-follow-up` to keep working.
- `POST /api/contacts/:id/next-follow-up/complete` to keep working.

## Validation

After deployment, verify:

```txt
GET /api/auth/me      -> 200
GET /api/contacts     -> 200
GET /api/companies    -> 200
GET /api/follow-ups/overview -> 200
```
