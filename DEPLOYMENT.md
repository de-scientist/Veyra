# JB Mercantile Deployment Guide

## Prerequisites

- Node.js 20+, npm 9+, PostgreSQL 14+.
- All secrets provisioned in the hosting platform's secret manager (never in Git).
- Production domain + TLS decided; HTTPS callback URL reserved for M-Pesa.

## Environment Configuration

1. Copy `.env.example` to the platform's env store (do not commit `.env`).
2. Set `NODE_ENV=production`, real `APP_URL`/`NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_API_URL`/`CORS_ORIGIN` (exact origins, no wildcards).
3. Generate fresh `AUTH_SECRET`/`SESSION_SECRET` (â‰¥32 random chars).
4. Configure `DATABASE_URL` (documented app role), M-Pesa, and optional email settings.

## Database Migration

The repository uses Prisma CLI and `@prisma/client` 5.22.0.

The active migration history contains one consolidated baseline:
`prisma/migrations/20261013000000_baseline/migration.sql`.

The previous 16 migration SQL files are preserved in
`migration-archive/legacy-prisma-migrations-20261013/` for historical reference.
They are not part of the active Prisma migration history.

**Production deployment prerequisites:**

- Confirm the target database is the intended, empty PostgreSQL database.
- Confirm `DATABASE_URL` is configured in the deployment environment.
- Back up any database that contains data before changing its schema.
- Never apply this initial baseline to a non-empty database without a reviewed
  reconciliation plan.

Validate the schema and generate the Prisma Client:

```sh
npx prisma validate --schema prisma/schema.prisma
npm run db:generate
```

Deploy the active migration history:

```sh
npm run db:migrate:deploy
```

Run this from the repository root. The production command uses `prisma migrate deploy`;
it does not create migrations or reset the database. Do not use `prisma migrate dev`
against production, and never run `prisma migrate reset` against production.

The baseline SQL was generated from the current Prisma schema and its SHA256 hash
was verified against freshly generated SQL. Its SQL has not been executed against a
disposable PostgreSQL database, so execution has not been independently tested.

After deployment, verify the migration status and application health before enabling
normal traffic.
## Seed (production-safe subset only)

Run `tsx prisma/seed.ts` for roles/permissions/admin-bootstrap/shipping-zone baseline,
then verify no demo customers, orders, payments, or reviews exist. Create the first
administrator via an audited bootstrap (secure password, `admin` role only â€” never
`super_admin` by default), then rotate any temporary credential immediately.

## Build

```sh
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

## Deploy Order

1. Infrastructure â†’ 2. database â†’ 3. migrations â†’ 4. backend â†’ 5. frontend â†’
6. DNS â†’ 7. external callbacks (M-Pesa) â†’ 8. smoke tests.

## Health Checks & Smoke Tests

- `GET /api/v1/health` â†’ 200 `{ ok: true }`; `GET /api/v1/ready` â†’ 200 (503 = hold traffic).
- Automated suite: `apps/api/src/smoke.test.ts` (catalog â†’ cart â†’ checkout â†’ confirmation â†’
  payment-fails-closed â†’ register â†’ admin/RBAC) and `security.test.ts` (401/403/404 contract,
  CORS, headers, rate limits, DB-backed IDOR). Both self-clean against a scratch database.
- Manual: storefront, checkout (sandbox), admin queues, analytics, exports.

## Rollback

- Application: redeploy the previous artifact (stateless API + static frontend).
- Database: migrations are additive with no down path â€” restore from the pre-deploy backup
  if schema must retreat. Never roll back forward-only enum additions by hand-editing.
- Config/DNS: revert env or records; re-run smoke tests after every rollback.

## Troubleshooting

See OPERATIONS-RUNBOOK.md (probes, request-ID correlation, reconciliation, dead letters,
rate-limit tuning). Logs: pino JSON in production; `LOG_LEVEL=info` default.
