# Hybrid CRM - local bootstrap and migration pass

## What was added

- `.nvmrc` pinned to Node 22
- `npm run setup:env`
- `npm run local:bootstrap`
- `npm run local:verify`
- `docs/ENVIRONMENT.md`
- `docs/LOCAL-TESTING.md`
- Prisma PostgreSQL migration baseline under `apps/api/prisma/migrations`

## Recommended local flow

```bash
nvm use
npm ci
npm run local:bootstrap
npm run dev
```

## Recommended verification flow

```bash
npm run local:verify
```

## Why this change

The project had PostgreSQL in Prisma config but no committed migration baseline.
That makes local setup and deployment drift-prone.

This pass makes local development more deterministic and gives deployment a versioned schema baseline.
