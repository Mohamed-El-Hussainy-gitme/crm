# Cloudflare Today Page Hotfix

## Issue

After login, `/today` could render Next.js runtime error page even while API requests returned HTTP 200.

Root cause: the Cloudflare backend `GET /api/follow-ups/overview` returned `paymentAlerts` as raw `PaymentInstallment` rows. The frontend expected each payment alert to include a nested `contact` DTO, matching the legacy Fastify/Prisma response shape.

When at least one overdue/pending payment existed, the page accessed `payment.contact.fullName` and crashed.

## Fix

- `packages/backend/src/followups/service.ts`
  - Added `serializePaymentAlert()`.
  - Hydrates each payment alert with a safe nested contact object from the contacts map.
  - Keeps the response shape compatible with the existing frontend.

- `apps/web/app/today/page.tsx`
  - Added defensive array fallbacks for planner sections.
  - Added a safe fallback for missing `payment.contact`.

## Validation

After deploy, verify:

- `GET /api/auth/me` returns 200.
- `GET /api/follow-ups/overview` returns `paymentAlerts[*].contact.fullName`.
- `/today` loads without the Next.js error page.
