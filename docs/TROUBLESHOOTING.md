# Troubleshooting

## Port already in use (`EADDRINUSE`)

API defaults to `:3001`, web to `:3000`. Find the holder (`netstat -ano | findstr :3001` on Windows, `lsof -i :3001` elsewhere) and stop it, or set `API_PORT`.

## Missing / wrong environment

Symptom: boot crash from `lib/env.ts` or Prisma `DATABASE_URL` errors. Fix: copy `.env.example` → `.env`, fill secrets, keep `CORS_ORIGIN` exactly matching the web origin.

## Database unavailable

Symptom: `/ready` → 503, `P1001` errors. Fix: `docker-compose up -d postgres`, verify `DATABASE_URL`, then migrations.

## Prisma client drift (`@prisma/client` vs schema)

Regenerate: `npm run db:generate`. Client version pinned to match `@prisma/client` 5.22.0 (see [DEPLOYMENT](../DEPLOYMENT.md)).

## Migrations

The repo Prisma CLI has no working `migrate` command — apply SQL forward-only with `psql -v ON_ERROR_STOP=1 -f <file>` in the documented order. Never `prisma migrate reset`.

## API unreachable from web

Check `NEXT_PUBLIC_API_URL`, CORS origin match, and that the API is running; auth cookies require same-site context (`credentials: include`).

## Build failures

Run `npm run typecheck` first (surfaces TS errors fastest). A stale `apps/web/.next` cache once caused a bogus `PageNotFoundError: /_document` — delete `.next` and rebuild.

## Theme issues

Flash of wrong theme: `ThemeScript` must render in `app/layout.tsx` before paint. Stuck theme: clear `localStorage` key `jb-mercantile-theme`.

## M-Pesa issues

`MPESA_NOT_CONFIGURED`: fill all six `MPESA_*` vars. Production refusal: callback must be HTTPS and `MPESA_ENVIRONMENT=production`. Callbacks failing: check raw-payload validation logs and proxy body handling (callbacks are idempotent — safe to redeliver). Orders stuck `UNPAID`: reconcile `PaymentTransaction` rows against Daraja receipts; never mark paid manually.

## Notifications stuck

Inspect `NotificationOutbox` (`FAILED`/`DEAD_LETTER`) and drain via `POST /admin/notifications/process`.

## 429 spikes

Shared egress IPs exhaust budgets; tune `RATE_LIMIT_*` — never disable auth limits.
