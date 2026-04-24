# Cleanup pass

This cleanup pass keeps the latest working Phase 7C codebase intact while reducing repository noise.

## Applied changes

- removed generated build artifacts from `apps/api/dist` and `packages/shared/dist`
- moved historical phase and hotfix notes from the repository root into `docs/archive`
- refreshed `README.md` to describe the active workflow and documentation layout
- updated documentation for the current local API base URL guidance
- added a placeholder `apps/web/public/favicon.ico` to avoid local 404 noise

## Intentionally unchanged

- application source code and database schema
- local environment files already present in the project snapshot
- Supabase / runtime credentials
