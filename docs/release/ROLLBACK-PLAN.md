# Rollback Plan

## Application

Stateless API + static frontend: redeploy the previous artifact/tag. No datum
lives in process memory except the M-Pesa token cache (safe to drop) and the
notification worker's in-memory replay set (re-derivable; callbacks reprocess
idempotently).

## Database

All shipped migrations are additive (`IF NOT EXISTS`, new tables/columns/indexes
only) with **no down path**. Never roll back schema by hand-editing. If schema
must retreat, restore from the pre-deploy backup (see runbook) and re-verify.

## Configuration / DNS

Revert env or records to prior values; re-run `GET /health`, `GET /ready`, and
the smoke suite after every rollback. Rollback itself has not been executed
(no production target exists) — rehearse it in staging before go-live.
