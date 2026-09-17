# PHASE 7 REPORT

## Executive Summary

Phase 7 adds the provider-agnostic payment layer and M-Pesa Daraja STK Push integration boundary. Orders remain authoritative for amount and currency. Payment initiation creates auditable attempts, provider callbacks are correlated and validated, and only a matching successful callback can mark payment and the order paid.

The implementation is ready for sandbox configuration, but no live M-Pesa request was made because credentials and a publicly reachable callback URL are not present in this environment.

## Scope

Implemented:

- `PaymentProvider` abstraction
- M-Pesa provider with sandbox/production endpoint selection
- server-side OAuth token caching
- STK Push request construction
- timeout and provider-error normalization
- payment attempt and transaction persistence
- initiation idempotency and active-attempt protection
- callback parsing and correlation by `CheckoutRequestID`
- callback amount verification
- duplicate callback handling
- payment/order state synchronization
- reservation conversion and stock decrement on verified payment
- payment status endpoint
- pending, success, failure, and retry UI
- environment configuration documentation
- provider-boundary unit tests

Not implemented:

- cards, PayPal, Airtel Money, bank transfer, cryptocurrency
- refunds
- accounting or reconciliation dashboard
- advanced fraud detection
- fulfillment or courier integration

## Payment Architecture

The order remains the financial intent. `Payment` represents the provider/order payment lifecycle, while each `PaymentTransaction` represents one provider attempt. The M-Pesa provider only authenticates and calls Daraja; it never mutates orders, payments, or inventory.

The application service owns payable-order authorization, attempt creation, status transitions, callback validation, and inventory reservation lifecycle changes.

## M-Pesa Integration

The provider uses the official Daraja OAuth and STK Push paths:

- sandbox base: `https://sandbox.safaricom.co.ke`
- production base: `https://api.safaricom.co.ke`
- OAuth: `/oauth/v1/generate?grant_type=client_credentials`
- STK Push: `/mpesa/stkpush/v1/processrequest`

Credentials and callback URL are server-only. Access tokens are cached in process memory until shortly before expiry and are never returned or logged.

The STK request derives `Password` from shortcode, passkey, and server timestamp. Amount, phone, order reference, and callback URL come from the backend. Provider responses are normalized without exposing raw payloads to customers.

Callback authenticity follows Daraja's callback model: the endpoint is public for provider delivery, then validates the expected callback structure, correlates the stored checkout request ID, verifies amount and result state, and processes idempotently. No invented signature mechanism is used.

## Database Changes

`Payment` now has one provider payment record per order/provider. `PaymentTransaction` stores provider merchant request ID, idempotency key, currency, failure reason, raw response, and provider lookup indexes. The Phase 7 migration adds these columns and constraints.

Existing `Payment`, `PaymentTransaction`, `InventoryReservation`, `InventoryMovement`, and `OrderStatusHistory` models are reused. No alternate payment or inventory model was introduced.

## Payment State Machine

Initiation:

```text
Payment UNPAID/FAILED -> PENDING
PaymentTransaction -> PENDING
```

Provider rejection:

```text
PaymentTransaction PENDING -> FAILED
Payment PENDING -> FAILED
Order remains UNPAID
```

Verified callback success:

```text
PaymentTransaction PENDING -> PAID
Payment PENDING -> PAID
Order.paymentStatus UNPAID/PENDING -> PAID
Order PENDING -> CONFIRMED
```

A duplicate successful callback has no additional effect. The order is never marked paid from frontend state or STK acceptance alone.

## Order Integration

`POST /api/v1/payments/mpesa/initiate` loads the order by order number, verifies the current customer or guest confirmation token, rejects cancelled/already-paid/non-KES orders, and uses persisted `Order.grandTotal` and `Order.customerPhone`.

## Inventory Integration

Phase 6 creates `ACTIVE` reservations. After a verified matching successful callback, each active reservation is converted transactionally. `quantityReserved` and `quantityOnHand` are decremented together and an `OUT` movement is recorded. The conversion is guarded by conditional updates and rolls back with payment state if inventory cannot be synchronized.

This preserves the existing invariant that payment success is separate from delivery. Payment does not mark an order shipped or delivered.

## Idempotency

Payment initiation requires an `Idempotency-Key`. The stored key is scoped to the order and provider through a SHA-256 correlation key. Repeating the same request returns the existing attempt; a recent pending attempt also prevents uncontrolled duplicate STK prompts. A confirmed failed attempt can be retried with a new key.

Callbacks are idempotent through stored provider request IDs and transaction status. A previously paid transaction is acknowledged without repeating payment, order, or inventory effects.

## Security

- Order access requires authenticated ownership or the Phase 6 confirmation token.
- Order number is not an authentication credential.
- Amount and currency come from persisted order state.
- Customer-supplied amount/status/currency/provider identifiers are ignored.
- OAuth credentials, passkey, access tokens, and raw authorization headers remain server-side.
- Callback requests do not depend on browser authentication.
- Raw provider responses are stored for operational debugging but are not exposed through customer APIs.
- Existing global API rate limiting applies to initiation and callback routes.

## API Documentation

Base path: `/api/v1`.

### `POST /payments/mpesa/initiate`

Guest or authenticated order owner. Requires `Idempotency-Key`. Body: `{ "orderNumber": "ORD-..." }`. Guests provide the Phase 6 confirmation token via `x-confirmation-token` or `token`. Amount is loaded from the order. Returns safe payment status, transaction ID, provider request ID, and a customer message.

### `POST /payments/mpesa/callback`

Provider-to-server endpoint. No customer authentication. Parses and validates Daraja callback data, correlates `CheckoutRequestID`, verifies result and amount, and returns the provider acknowledgement shape. Duplicate or unknown callbacks are safely acknowledged.

### `GET /payments/:paymentId/status`

Authenticated order owner or guest confirmation-token holder. Returns only payment status, amount, currency, provider, safe provider reference, and paid timestamp.

## Frontend

The existing order confirmation page now exposes `Pay with M-Pesa` for unpaid orders. It shows initiation progress, pending instructions, polls the safe payment-status endpoint every four seconds, stops on `PAID` or `FAILED`, displays the M-Pesa receipt when available, and allows retry after a confirmed failure. The same idempotency key is reused during uncertain retries.

## Testing

Fresh repository checks should include:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npx prisma validate`

Added provider-boundary tests cover deterministic opaque correlation keys and separation of order/attempt combinations. Database-backed callback, concurrency, rollback, and sandbox tests remain pending because local PostgreSQL authentication is still failing with `P1000`.

Final verification in this environment:

- `npm run lint` — passed; only pre-existing Next `<img>` optimization warnings remain
- `npm run typecheck` — passed
- `npm test` — 13 tests passed
- `npm run build` — passed
- `npx prisma validate` — passed
- `npx prisma migrate deploy` — blocked by PostgreSQL `P1000` authentication failure

No live M-Pesa sandbox request was executed: the environment contains placeholder credentials and no publicly reachable callback endpoint.

## Sandbox Configuration

Set these server-side variables in local development:

```text
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=174379
MPESA_PASSKEY=...
MPESA_CALLBACK_URL=https://public-sandbox-callback.example/api/v1/payments/mpesa/callback
```

The legacy `M_PESA_*` credential names remain accepted for compatibility, but the `MPESA_*` names are documented and preferred.

## Production Deployment

Production requires `MPESA_ENVIRONMENT=production`, real production credentials, an HTTPS callback URL, secret management outside source control, and a publicly reachable API route. Production configuration rejects non-HTTPS callback URLs and sandbox mode.

## Reconciliation Foundation

Each order/payment/attempt stores expected amount, currency, provider request IDs, merchant request ID, provider receipt/reference, result payload, status, and failure reason. Amount mismatches are not marked paid; they become a failed attempt/payment with `RECONCILIATION_REQUIRED` recorded as the failure reason. A full reconciliation dashboard and refund policy remain outside this phase.

## Known Limitations

- Live sandbox testing is blocked until real M-Pesa credentials and a public callback URL are configured.
- Live database migration is blocked by invalid local PostgreSQL credentials (`P1000` at `localhost:5432`).
- Callback authenticity is layered structural/correlation/amount validation because Daraja's selected STK callback flow does not provide a configured signature mechanism here.
- Payment token cache is process-local; a multi-instance deployment should use a shared secure cache or tolerate token refreshes.
- Reservation expiry/release automation is not implemented; its duration and post-expiry payment policy remain unresolved.
- M-Pesa amounts must be whole KES values because Daraja STK Push requires an integer amount.

## Business Decisions Required

- `UNKNOWN — REQUIRES BUSINESS DECISION`: reservation/payment pending duration and expiry job.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: handling of verified payment after reservation/order expiry.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: overpayment and underpayment treatment.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: raw provider payload retention period.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: production callback network allowlisting requirements.

## Architectural Invariants

- Order is not Payment.
- Payment initiation is not payment success.
- Frontend is not payment authority.
- Callbacks are correlated and validated, not blindly trusted.
- Payment success is not delivery or shipment.
- Order grand total is the payment amount authority.
- Payment attempts remain historical records.
- Duplicate callbacks are harmless.
- Provider secrets remain server-side.
- M-Pesa remains behind the provider abstraction.

## Stop Condition

M-Pesa payment architecture and integration are implemented, but sandbox execution remains pending credentials and public callback configuration. No Phase 8 work has been started.
