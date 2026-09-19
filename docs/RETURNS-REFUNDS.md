# Returns, Exchanges & Refunds

`Return`, `Exchange`, `Refund`, and payment reversal are distinct — one does not automatically mean another.

## Eligibility

Authenticated owner, order `PAID` and delivered, within `RETURN_WINDOW_DAYS` (if set), no duplicate items, quantities within remaining. Guests request via `/returns` with order lookup.

## Return Lifecycle

`REQUESTED → UNDER_REVIEW → APPROVED → RETURN_INITIATED → RECEIVED → INSPECTING → APPROVED_FOR_RESOLUTION → RESOLVED`, with `REJECTED` / `CANCELLED` exits. Admin queue actions: review, approve, reject, receive, inspect (per-item condition + disposition required; `RESTOCK` increments stock once with `RETURN` movement).

## Exchanges

`type: EXCHANGE` requires a `replacementVariantId` (must be `ACTIVE` with available stock); refund amount computed per item (`orderItem.total / qty × returnQty`). `Exchange` states run `REQUESTED → … → COMPLETED`, but code observed only creates `REQUESTED` — allocation/fulfillment flow UNKNOWN.

## Refunds

`Refund` states: `REQUESTED → PENDING → PROCESSING → SUCCEEDED` (+`FAILED`/`CANCELLED`). Flow: operations creates the refund (idempotency key, capped so total refunded never exceeds the `PAID` amount) → **admin+ manually completes** it via `POST /admin/refunds/:id/process` with a provider reference (creates `RefundTransaction(SUCCEEDED)`, sets `REFUNDED`/`PARTIALLY_REFUNDED`, resolves the return). There is **no automatic M-Pesa B2C disbursement** — disbursement happens out-of-band and is recorded. Refund/exchange business rules (windows, fees): BLOCKER — see [BUSINESS-DECISIONS](../BUSINESS-DECISIONS.md).
