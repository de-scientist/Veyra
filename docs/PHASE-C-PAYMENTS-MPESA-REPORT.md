# Phase C — Payments, M-Pesa Integration & Payment-State Reliability Report

Status: IMPLEMENTED. Builds on Phases A/B. No real-money movement; all provider I/O in tests is mocked. No second payment system, no frontend payment authority, no UI redesign.

## 1. Executive Summary

The audit found a complete, working M-Pesa/Daraja stack (provider abstraction, OAuth, STK push, callback, idempotency, amount checks, notifications, customer/admin UIs). Phase C fixed its three genuine gaps and added the missing recovery path:

1. **Terminal-state clobbering in callbacks** — a late failure for a superseded attempt could overwrite `PAID`; `FAILED` transaction rows were reprocessed on redelivery. Fixed: terminal rows ack-as-duplicate, payments never downgrade from `PAID`.
2. **Concurrent duplicate callbacks double-processed** — two simultaneous successes both read `PENDING` and both converted inventory/notified. Fixed: atomic row claims (transaction + payment) inside the business transaction; loser acks as duplicate.
3. **No STK query/recovery path** — delayed/missing callbacks left `PENDING` forever with no recourse. Implemented: `queryTransaction` provider call, owner-scoped `POST /payments/:paymentId/query` folding outcomes through the same guarded machinery, plus a "Check status" control on the confirmation screen. UNKNOWN probe results change nothing.
4. **No audit trail for payments** — `PAYMENT_UPDATED` existed in the enum with zero writers. Initiation and every terminal transition now write audit rows (actor null for provider-driven events).

## 2. Existing Payment Architecture

Preserved as audited: `Payment` (unique `orderId+provider`, `UNPAID/PENDING/PAID/FAILED/...`) → `PaymentTransaction[]` (unique `provider+idempotencyKey`, per-attempt provider ids, raw responses); `PaymentProvider` interface (`initialize`) with `MpesaPaymentProvider` (OAuth token cache, 15 s timeout, sandbox/production bases, production HTTPS+mode guard); service layer (`initiateMpesaPayment`, `handleMpesaCallback`, `getPaymentStatus`); routes (`initiate`, `callback` answering Daraja-shaped `{ResultCode: 0}`, `status`); customer confirmation UI (pending/success/failure/retry + 4 s backend polling with cleanup); customer payment history; read-only admin payments table with failure reasons; `PAYMENT_CONFIRMED/FAILED` notification events with deterministic ids.

## 3. M-Pesa Integration

- OAuth client-credentials with process-local cached token + pre-expiry refresh; STK push `CustomerPayBillOnline` with server-side amount (order `grandTotal`), normalized `254[17]XXXXXXXX` phone, callback URL from env; all credentials env-only (`MPESA_*`, legacy `M_PESA_*` aliases), never `NEXT_PUBLIC_*`.
- Added `queryTransaction` (`stkpushquery/v1/query`, same password scheme) returning concluded `ResultCode/ResultDesc` or nothing when still pending.
- Sandbox-only posture kept: `.env`/`.env.example` carry placeholder values; production requires `MPESA_ENVIRONMENT=production` + HTTPS callback (enforced in code).

## 4. API Endpoints

| Method/Path | Auth | Contract |
| ----------- | ---- | -------- |
| `POST /payments/mpesa/initiate` | owner (session or confirmation token), `Idempotency-Key`, sensitive rate limit | `{orderNumber}` → `{payment, transactionId, providerRequestId, customerMessage, replayed}`; 400 validation/phone/config, 404 foreign/missing, 409 paid/cancelled, 503 retryable outage |
| `POST /payments/mpesa/callback` | none (Daraja sends no signature) | strict `stkCallback` shape → always `{ResultCode: 0, ResultDesc}`; unknown txns ack without effects |
| `GET /payments/:paymentId/status` | owner | safe serialized payment only |
| `POST /payments/:paymentId/query` (new) | owner, sensitive rate limit | probes latest `PENDING` attempt; returns `{payment, transactionId, refreshed, pending}`; UNKNOWN changes nothing |

## 5. Payment State Machine

`UNPAID → PENDING → PAID`, `PENDING → FAILED`, `FAILED → PAID` (retry with a new attempt only), `PAID → *` blocked, terminal transaction rows immutable. Verified by tests: triple success delivery → one transition; concurrent duplicates → one winner; late failure after `PAID` → stays `PAID`; `FAILED`-row redelivery → no-op; amount mismatch (2500 vs 1000) → `FAILED` + `reconciliationRequired`, never paid.

## 6. Callback Handling

Parse → correlate by `CheckoutRequestID` → amount-verify (when supplied) → atomic claim → terminal updates (transaction + payment + order + history + reservation conversion + movement + event) in one transaction. Order `PENDING → CONFIRMED` only on real transition (fresh in-txn read); fulfillment stays `UNFULFILLED`; inventory conversion uses the existing guarded per-row decrement (`PAYMENT_INVENTORY_SYNC_FAILED` → reconciliation, never silent double-spend).

## 7. Idempotency Strategy

Three layers: (a) initiation keyed by `sha256(orderId:idempotencyKey)` with unique constraint → replay; active-attempt collapse within 2 min; (b) callback claims + deterministic notification ids → redelivery-safe; (c) checkout idempotency from Phase B (no duplicate orders/reservations on retry).

## 8. Security Model

Backend-only success authority (no amount/status accepted from clients — the initiate body has no amount field at all); owner-scoped reads (strangers get 404, never 403-oracle); callback unauthenticated by provider design with compensating controls (server correlation, amount check, atomic idempotency, terminal guards; always-ack to avoid retry storms); secrets never logged/exposed (tests assert); sensitive rate limits on initiate/query; 15 s provider timeouts with retryable/non-retryable taxonomy.

## 9. Environment Variables

`MPESA_CONSUMER_KEY/SECRET`, `MPESA_SHORTCODE` (sandbox default `174379`), `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENVIRONMENT` (`sandbox`|`production`), legacy `M_PESA_*` aliases. Documented in `.env.example` (placeholder values) and `docs/ENVIRONMENT.md`. Production cutover remains a business/ops action (real credentials, HTTPS callback, secret manager).

## 10. Customer Payment UX

Unchanged states (ready/initiated/pending/success/failed) plus new "Check status" recovery control while `PENDING` (backend query, no false success, errors surfaced inline). Polling already stopped at terminal states with timer cleanup. No `alert/confirm/reload`.

## 11. Admin Payment UX

Unchanged and sufficient: read-only table (order/provider/amount/status/reference/failure reason), order detail with per-attempt history, no manual mark-paid affordance (explicitly out of scope; runbook forbids manual paid-marking).

## 12. Inventory Interaction

No second system: success converts the checkout `ACTIVE` reservations (guarded decrement, `OUT` movement, `CONVERTED`); failure leaves reservations `ACTIVE` for the Phase B stale-sweep lifecycle; initiation reserves nothing new.

## 13. Test Results

New `apps/api/src/lib/payments/payments.test.ts` (19 tests, mocked Daraja transport, real DB): initiation matrix (valid/replay/active-collapse/foreign/paid/phone/config/reject/timeout/OAuth-failures), callback matrix (success×3, route shape, cancel+retry, FAILED→PAID, PAID→FAILED blocked, amount mismatch, unknown txn, concurrent race), query matrix (promote/unknown/forbidden), audit-trail assertions. Full suite: **303/303 PASS (41 files)**.

## 14. Sandbox Verification

**NOT VERIFIED — M-PESA SANDBOX ENVIRONMENT REQUIRED.** No live Daraja calls were made (no sandbox credentials in this environment); provider behavior is covered with mocked sandbox-shaped responses. Nothing here proves production readiness.

## 15. Known Limitations

- STK query relies on Daraja `ResultCode` presence; genuinely UNKNOWN states stay `PENDING` (by design — never auto-fail).
- OAuth token cache is process-local (multi-instance note carried over, unchanged).
- Callback has no rate limit (provider retries must not be throttled); abuse surface is limited to ack-only processing of unknown ids.

## 16. Production Risks

Real credentials handling, callback URL public reachability, Safaricom IP/retry behavior unverified, shortcode settlement ownership (business blocker, unchanged).

## 17. Deferred Work

Provider reconciliation console, automated STK-query sweeper for stuck `PENDING`s, multi-provider (`CARD`/`PAYPAL` enums exist, unwired).

## 18. Final Status

```text
PHASE C STATUS

Payment Architecture: PASS
M-Pesa Sandbox: NOT VERIFIED (no credentials; mocked sandbox shapes only)
STK Push: PARTIAL (code + mocked tests PASS; live Daraja NOT VERIFIED)
Callbacks: PASS
Idempotency: PASS
Payment State Machine: PASS
Security: PASS
Inventory Interaction: PASS
Customer UX: PASS
Admin UX: PASS
Tests: PASS (19 new; 303/303 suite)
Typecheck: PASS
Lint: PASS (0 errors)
Build: PASS
Browser Validation: NOT VERIFIED (no harness)
Documentation: PASS (report + docs/PAYMENTS.md updated)
```

```text
Critical Findings
- Callback terminal-state clobber + concurrent double-processing (fixed, tested).
- Missing STK query recovery (implemented, tested with mocks).
- PAYMENT_UPDATED audit gap (implemented).
Known Limitations / Deferred Items / Production Risks: see §§15–17.
Recommended Next Phase: Phase D fulfillment (payment gate consumes the PAID states proven here).
```
