# Hybrid CRM — Phase 6 Priority 4

This pass hardens **observability and smoke-test coverage** on top of the workflow-safe Priority 3 build.

## Delivered

### 1) Structured request observability
- Added request-id generation and propagation.
- Preserves inbound `x-request-id`, falls back to `cf-ray`, then generates a UUID.
- Returns `x-request-id` on all responses.
- Adds `x-response-time` for tracing slow requests.
- Logs structured request-completion events with:
  - method
  - url / route
  - status code
  - response time
  - ip / forwarded-for
  - Cloudflare ray id when present
  - user agent

### 2) Safer production error responses
- Error payloads now include `requestId` for traceability.
- `5xx` errors return a generic public message instead of leaking internals.
- Server logs still keep structured error details.
- Added explicit `404` not-found handler with stable request ids.

### 3) Health and readiness endpoints
- Added `/health/live` for liveness checks.
- Added `/health/ready` for readiness checks backed by a database ping.
- Kept `/health` as a readiness-style alias.
- Readiness failures now return `503` with degraded database state.

### 4) Startup and runtime diagnostics
- Startup now logs environment, database provider, and proxy-awareness.
- Added top-level `unhandledRejection` and `uncaughtException` logging.
- Fastify request logging is now intentionally controlled through custom structured hooks.

### 5) Smoke tests
Added API-side smoke tests covering:
- request-id resolution
- observability helper behavior
- health/live and health/ready success paths
- readiness failure path (`503`)
- not-found responses with request ids

## Primary files changed
- `apps/api/src/lib/observability.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/src/tests/phase6-priority4.test.ts`
- `apps/api/package.json`

## Cloudflare relevance
This pass is aligned with later Cloudflare deployment:
- honors inbound edge trace headers (`cf-ray`)
- keeps proxy-aware request logging useful behind Cloudflare
- makes API errors diagnosable from edge logs and origin logs together

## Notes
- This pass focuses on observability and smoke coverage, not browser E2E automation.
- Because dependencies were not installed in the execution environment, I could not run the full Fastify/Prisma test suite here. The implementation was made to be testable with mocked Prisma state once dependencies are installed.
