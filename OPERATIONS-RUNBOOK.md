# Veyra Operations Runbook

## Health & Probes

- Liveness: `GET /api/v1/health` (cheap, unauthenticated) → `{ ok: true }`.
- Readiness: `GET /api/v1/ready` (SELECT 1; 200 ready / 503 `NOT_READY`, no driver leakage).
- Every error response carries `error.requestId`; correlate with server logs (`requestId` field).

## Deployment

1. Set environment from `.env.example` (production values; never commit `.env`).
2. Install, generate Prisma client (`prisma@5.22.0 generate`), build API + web.
3. Apply pending migrations forward-only with `psql -v ON_ERROR_STOP=1 -f <file>` (repo CLI has no working migrate command; see PHASE-14-REPORT §32).
4. Start API, then web. Verify `/health`, `/ready`, storefront, login, admin, analytics.
5. Rollback: redeploy previous artifact; migrations are additive — no down-migration exists, so restore from backup if schema must retreat.

## Database

- Backups: daily `pg_dump` (custom format), encrypted at rest, 30-day retention, off-site copy. Verify with `pg_restore --list` plus quarterly restore-into-isolated-DB smoke test.
- Connection issues: check pool saturation (`pg_stat_activity`), restart API before database; never share the migration superuser with the app role in production.

## Troubleshooting

| Symptom | Check | Action |
|---|---|---|
| Orders stuck UNPAID | M-Pesa callback logs, `PaymentTransaction` failures, `RECONCILIATION_REQUIRED` flag | Reconcile against Daraja receipts; never mark paid manually |
| Callbacks 4xx/5xx | Raw payload validation errors in logs | Fix forwarding/proxy body handling; callbacks are idempotent — safe to redeliver |
| Oversell suspected | `Inventory` reserved vs onHand; `InventoryMovement` trail | Checkout uses conditional atomic reservation; investigate adjust audit rows |
| Notifications stuck | `NotificationOutbox` FAILED/DEAD_LETTER; `POST /admin/notifications/process` | Drain via admin endpoint; inspect dead-letter audit rows |
| 429 spikes | Rate-limit headers, shared egress IPs | Tune `RATE_LIMIT_*`; do not disable auth limits |
| Slow analytics | Long-range queries; `Refund(status, createdAt)` and Phase 12 indexes present | Narrow ranges; exports capped at 5,000 rows |

## Incident Response

Detect (alerts/logs) → Contain (revoke sessions/rotate secret/block origin) → Investigate (requestIds, audit logs) → Recover (fix forward, restore if needed) → Verify (smoke suite) → Document. Credential compromise always triggers rotation; payment compromise triggers reconciliation freeze + provider contact.
