# GitHub CI verification

This repository includes `.github/workflows/ci.yml` to test the CRM on GitHub Actions instead of relying only on local verification.

## What the workflow checks

1. Installs dependencies with `npm ci`.
2. Creates local env files from `.env.example` files.
3. Starts a PostgreSQL 16 service container.
4. Generates the Prisma client.
5. Applies Prisma migrations.
6. Seeds the database.
7. Runs the existing monorepo verification script:
   - shared build
   - API build
   - API tests
   - web tests
   - web build
8. Starts the real development command with `npm run dev` and smoke-tests:
   - `GET /health/live`
   - the web login page
   - `GET /api/auth/me` returns `401` when unauthenticated, not `404`
   - login using seeded admin credentials
   - authenticated `GET /api/auth/me`
   - authenticated `GET /api/follow-ups/overview`

## How to run it on GitHub

Push the project to GitHub. The workflow runs automatically on `push` and `pull_request`.

You can also run it manually:

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **CRM CI**.
4. Click **Run workflow**.

## Required secrets

No GitHub secrets are required for CI. The workflow uses an isolated PostgreSQL service container and non-production credentials.

Do not commit real `.env` or `.env.local` files. Only commit `.env.example` files.
