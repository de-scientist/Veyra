# PHASE 9 REPORT

## Executive Summary

Phase 9 adds a separate post-purchase returns, exchanges, inspection, inventory-disposition, and refund-request subsystem. Historical orders and successful payments remain immutable records. Return requests are item-level, customer-owned, staff-reviewed, and transition-controlled. Restock creates a `RETURN` inventory movement exactly once. Refunds are separate financial events with atomic refundable-balance protection.

The current M-Pesa provider is STK Push only. No official automated M-Pesa refund capability is configured or verified in this repository, so Phase 9 provides a controlled pending/manual refund fallback rather than inventing a provider endpoint.

## Scope

Implemented:

- configurable return-window validation
- customer-owned item-level return requests
- refund or exchange intent
- duplicate active-quantity protection
- return state machine
- staff review, approval, rejection, receipt, and inspection
- item condition and disposition
- transactional restock with `InventoryMovementType.RETURN`
- exchange record with replacement-variant availability validation
- centralized partial-refund calculation from order-item snapshots
- refund amount overpayment protection
- idempotent refund request records
- admin-only manual refund completion fallback
- customer return history UI
- staff return queue UI
- private metadata and safe DTOs
- migration, tests, and documentation

Not implemented:

- automated M-Pesa refund/disbursement calls
- refund provider callbacks
- store credit
- full exchange replacement fulfillment allocation
- return courier API
- return shipping policy engine
- customer support/ticketing
- Phase 10 functionality

## Architecture

```text
Order -> ReturnRequest -> ReturnItem
                         |-> Exchange
                         |-> Refund -> RefundTransaction
                         |-> InventoryMovement(RETURN)
```

Return, exchange, and refund are separate models and state machines. Original `OrderItem`, `Payment`, totals, SKU, product name, and historical payment events are never rewritten.

## Return Lifecycle

```text
REQUESTED
  -> UNDER_REVIEW
  -> APPROVED
  -> RETURN_INITIATED
  -> RECEIVED
  -> INSPECTING
  -> APPROVED_FOR_RESOLUTION
  -> RESOLVED
```

Rejection is `UNDER_REVIEW -> REJECTED`. Customer cancellation is represented in the enum but no customer cancellation endpoint is exposed yet because its business policy is unresolved.

## Return Eligibility

The backend requires:

- authenticated customer ownership of the order
- paid order
- delivered or picked-up fulfillment
- configured return window when `RETURN_WINDOW_DAYS` exists
- selected purchased order items
- positive integer quantities
- quantity no greater than purchased quantity minus active return quantities
- no duplicate item lines in one request
- exchange replacement variant when type is exchange

No default return window is invented. When `RETURN_WINDOW_DAYS` is absent, the time limit remains a business decision.

## Inspection and Disposition

Staff must inspect every returned item before resolution. Each item records condition and disposition. `RESTOCK` increments `quantityOnHand` and creates exactly one `RETURN` inventory movement, guarded by `restockApplied`. Other dispositions do not increase sellable inventory.

## Exchange Integration

An exchange stores the original order item/variant and the requested replacement variant. Replacement product status, variant status, and available inventory are revalidated transactionally at request time. Price differences are persisted as zero for V1 because pricing/collection rules are unresolved; replacement fulfillment allocation is a future extension using Phase 8 workflows.

## Refund Architecture

Refunds are separate from the original payment. A refund request derives its amount from returned `OrderItem.total / quantity * returned quantity`, sums successful previous refunds, and rejects any amount that would exceed the original paid payment. Full and partial refunds are represented by `Refund.amount`; the original order grand total remains unchanged.

Refund states are:

```text
REQUESTED -> PENDING -> PROCESSING -> SUCCEEDED
                                      \-> FAILED
```

The current implementation creates a pending refund request. An administrator may complete the controlled manual fallback with a provider reference. That completion creates a `RefundTransaction`, updates the payment to `PARTIALLY_REFUNDED` or `REFUNDED`, and resolves the linked return.

## M-Pesa Refund Integration

The existing M-Pesa provider supports STK Push initiation only. No verified official refund/disbursement endpoint, credentials, permissions, callback contract, or production capability exists in this repository. Therefore no M-Pesa refund API was invented. `Refund` and `RefundTransaction` retain provider, reference, amount, status, and raw-response-ready fields so an officially verified provider operation can be added later.

## Inventory Integration

Returned restock uses the existing `Inventory` and `InventoryMovement` models. Fulfillment/payment reservation logic is not duplicated. Non-restockable items remain recorded without increasing sellable stock.

## RBAC

Customers can create and view only their own return requests. Staff/admin operations users can review, approve, reject, receive, inspect, and request refunds. Manual financial completion is restricted to admin/super-admin roles through `requireFinancialAccess`.

The current repository has coarse role middleware; granular return/refund permission metadata remains a future refinement.

## API Documentation

Base path: `/api/v1`.

### Customer

- `POST /returns`: authenticated customer creates an item-level refund/exchange request.
- `GET /returns`: authenticated customer lists their own requests.
- `GET /returns/:returnId`: authenticated customer retrieves their own safe return DTO.

### Operations

- `GET /admin/returns?status=...`: staff/admin return queue.
- `GET /admin/returns/:returnId`: staff/admin detail.
- `POST /admin/returns/:returnId/review`: move requested to review.
- `POST /admin/returns/:returnId/approve`: approve reviewed request.
- `POST /admin/returns/:returnId/reject`: reject with required reason.
- `POST /admin/returns/:returnId/receive`: record receipt.
- `POST /admin/returns/:returnId/inspect`: inspect every item with condition/disposition.
- `POST /admin/returns/:returnId/refund`: create an idempotent pending refund request.

### Financial

- `POST /admin/refunds/:refundId/process`: admin-only controlled manual completion requiring provider reference.

All inputs are Zod-validated. Status, refund amount, disposition, provider reference, actor, and timestamps are backend-controlled.

## Customer UX

`/returns` is private and `noindex`. It loads an order through the existing secure authenticated order endpoint, lets the customer select quantities/reasons, submits a refund/exchange request, and displays safe request history and refund state.

## Staff UX

`/admin/returns` is private and `noindex`. It provides a queue with review, approve/reject, receive, inspect/restock, and refund-request actions. The UI is an operations surface; backend state transitions remain authoritative.

## Notifications and Audit

No notification/outbox provider exists in the repository, so this phase records durable return status history and inventory movements rather than sending email/SMS. Notification and audit event integration are future-ready but not implemented as a new platform.

## Security

- ownership is derived from the authenticated session
- order number and return ID alone do not authorize customer access
- guest returns are not supported in V1 because the existing guest confirmation token is not a suitable durable return authorization mechanism
- staff and financial routes use server-side role guards
- client status, refund amount, approval, disposition, and provider reference are not trusted
- customer DTOs omit staff notes, internal IDs where unnecessary, and raw provider data
- idempotency keys and unique return/refund constraints prevent duplicate financial requests

## Testing

Added return transition tests covering valid review/inspection progression and invalid bypass/terminal reversal. Existing auth, catalogue, shopping, payment, delivery transition, and provider tests remain in the suite.

Final verification should include:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npx prisma validate`
- DB-backed return/refund concurrency tests after PostgreSQL is available

Fresh verification completed:

- `npm run lint` — passed; existing Next image/autoprefixer warnings remain
- `npm run typecheck` — passed
- `npm test` — 18 tests passed
- `npm run build` — passed
- `npx prisma validate` — passed
- `npx prisma migrate deploy` — blocked by PostgreSQL `P1000` authentication failure

No Phase 9 migration was applied and DB-backed/manual return, exchange, restock, or refund QA remains pending until PostgreSQL credentials are corrected.

## Performance

Return queue queries use status/date indexes and bounded includes. Customer return history is scoped by user and ordered by creation time. Item eligibility is calculated in one order query rather than one request per item.

## Business Decisions Required

- `UNKNOWN — REQUIRES BUSINESS DECISION`: return window and whether missing configuration should block returns.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: returnable/non-returnable categories and sale-item policy.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: return shipping payer and logistics method.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: inspection criteria and disposition policy.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: refund shipping, discount, tax, and coupon allocation.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: exchange limits, price differences, shipping, and replacement fulfillment.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: guest return authorization.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: refund approval thresholds and segregation of duties.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: official M-Pesa refund/disbursement capability and callback contract.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: refund retry and provider timeout policy.

## Known Limitations

- Live database migration and DB-backed manual QA remain blocked by PostgreSQL `P1000` credentials.
- Automated M-Pesa refunds are not implemented or claimed.
- Exchange replacement stock is validated but not reserved/fulfilled as a new delivery.
- Return logistics tracking and courier-return adapters are not implemented.
- Customer cancellation endpoint is deferred pending policy.
- No notification worker/outbox exists.
- The operations UI uses a simple default inspection decision and should be replaced with a deliberate inspection form for production use.

## Invariants

- Return is not Refund.
- Return is not Exchange.
- Exchange is not Refund.
- Original orders and payments remain historically intact.
- Refunds cannot exceed successful paid amount.
- Returned items cannot be restocked twice.
- Inventory remains authoritative.
- Frontend never determines return approval, refund amount, disposition, or refund success.
- Financial completion is admin-only.
- Historical actions remain queryable through return status history, refund transactions, and inventory movements.

## Stop Condition

PHASE 9 implementation is complete and intentionally stops before Phase 10.
