# JB Mercantile Deployment Guide

## Prerequisites

- Node.js 20+, npm 9+, PostgreSQL 14+.
- All secrets provisioned in the hosting platform's secret manager (never in Git).
- Production domain + TLS decided; HTTPS callback URL reserved for M-Pesa.

## Environment Configuration

1. Copy `.env.example` to the platform's env store (do not commit `.env`).
2. Set `NODE_ENV=production`, real `APP_URL`/`NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_API_URL`/`CORS_ORIGIN` (exact origins, no wildcards).
3. Generate fresh `AUTH_SECRET`/`SESSION_SECRET` (≥32 random chars).
4. Configure `DATABASE_URL` (documented app role), M-Pesa, and optional email settings.

## Database Migration

The repo CLI (Prisma 8 RC) has no working `migrate` command. Approved process:

```sh
# In order, stopping on any error:
psql -v ON_ERROR_STOP=1 -f prisma/migrations/<each_20260917_*>/migration.sql
```

Order: `init`, `phase5_cart_wishlist`, `phase6_checkout_order`, `phase7_payments_mpesa`,
`phase8_fulfillment_delivery`, `phase9_returns_exchanges_refunds`,
`phase10_customer_account`, `phase11_notifications`, `phase12_admin`, `phase13_analytics`,
`phase14_product_media`, `phase14b_product_media_audit`, `phase15_catalogue_crud`,
`phase16_profile_avatar`.
All files are additive (`IF NOT EXISTS` guards). Never run `prisma migrate reset`.
Regenerate the client with `npx -y prisma@5.22.0 generate` (matches `@prisma/client` 5.22.0).

## Seed (production-safe subset only)

Run `tsx prisma/seed.ts` for roles/permissions/admin-bootstrap/shipping-zone baseline,
then verify no demo customers, orders, payments, or reviews exist. Create the first
administrator via an audited bootstrap (secure password, `admin` role only — never
`super_admin` by default), then rotate any temporary credential immediately.

## Build

```sh
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

## Deploy Order

1. Infrastructure → 2. database → 3. migrations → 4. backend → 5. frontend →
6. DNS → 7. external callbacks (M-Pesa) → 8. smoke tests.

## Health Checks & Smoke Tests

- `GET /api/v1/health` → 200 `{ ok: true }`; `GET /api/v1/ready` → 200 (503 = hold traffic).
- Automated suite: `apps/api/src/smoke.test.ts` (catalog → cart → checkout → confirmation →
  payment-fails-closed → register → admin/RBAC) and `security.test.ts` (401/403/404 contract,
  CORS, headers, rate limits, DB-backed IDOR). Both self-clean against a scratch database.
- Manual: storefront, checkout (sandbox), admin queues, analytics, exports.

## Rollback

- Application: redeploy the previous artifact (stateless API + static frontend).
- Database: migrations are additive with no down path — restore from the pre-deploy backup
  if schema must retreat. Never roll back forward-only enum additions by hand-editing.
- Config/DNS: revert env or records; re-run smoke tests after every rollback.

## Troubleshooting

See OPERATIONS-RUNBOOK.md (probes, request-ID correlation, reconciliation, dead letters,
rate-limit tuning). Logs: pino JSON in production; `LOG_LEVEL=info` default.
