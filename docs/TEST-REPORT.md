# Local test report

Date: 2026-04-24

## Scope

Validated the current CRM monorepo before feature development.

## Confirmed

- Root `npm run dev` starts the shared watcher, Fastify API, and Next.js web app in one command.
- API starts on `http://127.0.0.1:4000`.
- Web starts on `http://localhost:3000`.
- API live health endpoint returned `200` from `/health/live`.
- Web `/login` returned `200 text/html` in development mode.

## Commands run

```bash
npm ci --ignore-scripts
npm run build --workspace @smartcrm/shared
npm run test
npm run dev
```

Additional checks:

```bash
npm run test --workspace @smartcrm/api
npm run test --workspace @smartcrm/web
npm run build --workspace @smartcrm/web
```

## Results

- API tests: 5 passed, 0 failed.
- Web tests: 5 passed, 0 failed.
- Shared TypeScript build: passed.
- API TypeScript build: passed after Prisma client generation workaround for this offline container.
- Web production build: compiled, type-checked, and generated static routes successfully after limiting Next.js build workers.

## Environment limitations

Docker is not available in this container, so local PostgreSQL bootstrap could not be executed here.
Prisma engine downloads from `binaries.prisma.sh` were blocked by DNS in this container, so Prisma generation was validated with a local no-engine workaround for compile-time checks. On a normal developer machine, run the standard flow:

```bash
npm install
npm run setup:env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Code change applied

`apps/web/next.config.ts` now limits Next.js build workers to `cpus: 1`. This avoids worker `EPIPE` failures observed during `next build` in constrained environments.
