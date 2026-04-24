# Hybrid CRM Phase 6 - Priority 2

## Goal
Move the system to a production-shaped database posture and add the indexes needed for faster operational CRM queries.

## What changed
- Switched the Prisma datasource from **SQLite** to **PostgreSQL**.
- Updated development defaults to use the local Postgres container from `docker-compose.yml`.
- Added Prisma indexes for the highest-frequency CRM access paths, including contacts, tasks, payments, deals, activity feeds, audit logs, and automation runs.
- Updated health reporting to expose the active database provider.
- Hardened storage/backup behavior so the app no longer pretends file-copy backups work for PostgreSQL.
- Added Prisma workflow scripts for `migrate dev` and `migrate deploy`.

## Why this matters
This pass improves the system in three ways:

1. **Speed**
   - faster lookups for Today queues
   - faster follow-up / overdue scans
   - faster pipeline and reporting filters

2. **Scalability**
   - PostgreSQL is a better fit than SQLite for concurrent CRM usage
   - reporting and automation workloads are less risky under write contention

3. **Operational clarity**
   - backup behavior is explicit instead of silently SQLite-specific
   - local and production database posture now match more closely

## Added index coverage
Main indexes were added for:
- contact stage / owner / follow-up date
- task status / due date / owner / contact
- payment status / due date
- deal stage / owner / expected close
- activity and timeline ordering
- audit and automation query paths

## Notes
- This pass does not yet add versioned Prisma migrations generated from a live database.
- The storage module still supports file-copy backups only for SQLite; PostgreSQL should rely on managed backups or external dump tooling.
- This pass is intentionally aligned with future deployment behind Cloudflare while keeping the database outside the app runtime concerns.
