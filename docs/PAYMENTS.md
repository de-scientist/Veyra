# Payments & M-Pesa

Payment abstraction with M-Pesa Daraja as the wired provider (`PaymentProvider`: `MPESA`, `CARD`, `PAYPAL`, `OTHER` — only M-Pesa flows are implemented).

## Language Rule

**Initiating an M-Pesa STK request is not payment.** Only a backend-verified callback establishes `PAID`. The frontend never determines payment success.

## M-Pesa Flow

```mermaid
sequenceDiagram
    participant Web
    participant API
    participant Daraja as M-Pesa Daraja
    Web->>API: POST /payments/mpesa/initiate (order, phone, idempotency)
    API->>Daraja: OAuth + STK push (`/mpesa/stkpush/v1/processrequest`)
    Daraja-->>Web: PIN prompt on customer phone
    Daraja-->>API: POST /payments/mpesa/callback
    API->>API: Match by CheckoutRequestID, verify amount, idempotent apply
    API->>API: PAID → order CONFIRMED, convert reservation, notify
```

- Phone must normalize to `254[17]XXXXXXXX`; amount must be a positive whole KES number matching the order.
- Callback requires Daraja's `stkCallback` shape (`MerchantRequestID`, `CheckoutRequestID`, `ResultCode`, metadata with amount/receipt/phone). Result `0` + amount match → `PAID` (receipt stored); amount mismatch → `FAILED` with `RECONCILIATION_REQUIRED` (never mark paid manually — see runbook).
- Duplicate callbacks are harmless (idempotent by checkout request ID + deterministic event IDs).
- Frontend polls `GET /payments/:paymentId/status` until `PAID`/`FAILED`.

## Configuration

`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENVIRONMENT` (`sandbox`/`production`; legacy `M_PESA_*` aliases also read). Production refuses non-HTTPS callbacks and non-production mode. Sandbox shortcode default `174379`. Live-callback verification against Daraja: NOT VERIFIED. Production ownership (shortcode, settlement account): BLOCKER — see [BUSINESS-DECISIONS](../BUSINESS-DECISIONS.md).

## Payment States

`UNPAID → PENDING → PAID`, plus `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED` (set on manual refund completion). `PaymentTransaction` records every attempt with provider references and raw responses (never exposed to clients).
