# JB Checkout Payment UX Upgrade Report

## 1. Current Checkout Architecture

**Route:** `apps/web/app/checkout/page.tsx` → `components/CheckoutPageClient.tsx`.
Payment is collected **after** order creation on
`apps/web/app/order-confirmation/[orderNumber]/page.tsx` →
`components/OrderConfirmationClient.tsx`. This order-first shape was
preserved: checkout creates the order (`POST /api/v1/checkout`, idempotent),
then the confirmation page drives payment. No duplicate-order path was
introduced — retry reuses the same order and the existing
multiple-payment-attempt model (`Payment` + `PaymentTransaction` rows per
attempt, correlation-key idempotency).

**Backend authority (unchanged):** `apps/api/src/lib/payments/service.ts`
single choke point `applyProviderResult` for callbacks and query probes —
terminal rows never reprocessed, PAID never downgraded, amount mismatch →
`RECONCILIATION_REQUIRED` failure, concurrent duplicates collapse via atomic
row claims. Frontend never sets PAID. `PaymentStatus`: `UNPAID / PENDING /
PAID / FAILED / REFUNDED / PARTIALLY_REFUNDED`; `PaymentProvider`: `MPESA /
CARD / PAYPAL / OTHER`. Manual fallback reuses provider `OTHER` — no schema
or migration change, no conflicting enum.

## 2. Jumia UX Reference Findings

Used strictly as UX reference (no code, branding, assets, or text copied).
Adopted principles: clear payment-method selection with hierarchy; visible
order summary with authoritative totals; explicit processing state with a
do-not-refresh warning; failed payment offers retry **or** an alternative
method (never blind repeat); reassuring, blame-free failure messaging.

## 3. JB Checkout UX Changes

`CheckoutPageClient.tsx` restructured to the specified hierarchy —
01 Delivery information, 02 Delivery method, 03 Payment method (M-Pesa
recommended default / Manual M-Pesa), 04 Order summary (subtotal, discount,
delivery, authoritative total), 05 trust box (delivery, payment, help
contact). Payment choice is informational pre-order and forwarded to the
confirmation page as `?pay=manual` (pre-selects the manual tab). Loading via
`JBPageLoader` / `JBButtonLoader`; errors via `JBAlert`. Order summary stays
visible on desktop (sticky column) and stacks below the form under 900px.

## 4. Header Contact Update

`components/Header.tsx` utility bar now shows a clickable phone link
(`tel:+254741298268`, `phone` icon added to `JBIcons` in existing
stroke style) plus `We Deliver Across Kenya` (truck icon) and the desktop-only
Secure M-Pesa item / new-arrivals link. Mobile keeps the bar compact: phone +
delivery message only (`.utility-bar__link--desktop` hidden ≤640px). No
emoji; existing theme tokens only.

## 5. Automated M-Pesa Flow

Unchanged provider path (`initiateMpesaPayment` → STK Push → callback/query →
`applyProviderResult`). Confirmation page now surfaces phases
`IDLE / INITIATING / STK_SENT / WAITING_FOR_CONFIRMATION / PAID / FAILED`
mapped from authoritative `Payment.status` + local busy flag; branded
waiting panel (JB logo pulse) with PIN instructions and an explicit
do-not-close-or-refresh warning; 4s backend polling while pending; `Check
status` recovery probe (`POST /payments/:id/query`); >60s waiting shows a
still-waiting reassurance with manual-fallback signpost. Retry rotates the
idempotency key only after FAILED and never creates a second order. Verified
success shows order number + `KES` amount paid + provider reference.

## 6. Manual M-Pesa Fallback

Revealed automatically on automated failure (or by selecting Manual).
Paybill, account, and Pochi blocks with accessible copy buttons
(live-region `Copied` feedback + manual-copy fallback), exact authoritative
`order.grandTotal` as Amount to pay, concise Pay-Bill steps, channel radio
(Paybill/Pochi), transaction-code field (6–12 alphanumerics, normalized
uppercase), and a submit that records a **PENDING claim — never PAID**.
Post-submit messaging states verification is pending and names the contact
number for follow-up.

## 7. Paybill Configuration

`MPESA_PAYBILL_NUMBER = '400200'`, `MPESA_ACCOUNT_NUMBER =
'01116716087200'` in `apps/web/lib/business-contact.ts` (single source; no
magic strings in components).

## 8. Pochi La Biashara Configuration

`MPESA_POCHI_DISPLAY = '+254 741 298268'`, `tel:+254741298268` link, same
central module. No unsupported Pochi instructions are stated.

## 9. Payment State Handling

Auto states derive from backend `Payment.status`; manual claim states are
`PENDING (submitted, awaiting verification)` → `PAID` (staff-verified) or
`FAILED` (staff-rejected with reason). Browser refresh recovers via
`getOrder` + `getPaymentStatus` refetch; delayed callbacks recover via the
query probe. No React-state-only payment truth.

## 10. Manual Verification Architecture

`apps/api/src/lib/payments/manual.ts` (no migration): `submitManualPayment`
(customer, session-or-confirmation-token authorized; duplicate reference
across orders → 409; same-order same-code → replayed), `listManualPending`,
`verifyManualPayment`, `rejectManualPayment` (financial-role guarded at
routes, amount re-checked, reservations converted, `PAYMENT_CONFIRMED` event
emitted). Routes in `apps/api/src/routes/payments.ts`:
`POST /payments/manual/submit`, `GET /admin/payments/manual-pending`,
`POST /admin/payments/:paymentId/verify|reject`. Every transition writes an
`AuditLog` (`PAYMENT_UPDATED`, actor, before/after, timestamp). Admin queue
lives on `/admin/payments` (`ManualPaymentsQueue` with `JBConfirmDialog`
verify/reject + reason input; visibility is UX-only, API re-authorizes).

## 11. Security

Backend remains the sole payment authority; submission means
PAYMENT DETAILS SUBMITTED, never verified. Verification requires financial
roles (`requireFinancialAccess`); customers cannot self-verify (submit route
has no paid transition). One receipt can never pay two orders (duplicate
check on `PaymentTransaction.providerReference` + `Payment.providerReference`).
Transaction codes are business records in audit rows, never written to
application logs. API contract `{ success, error: { code, message, details,
requestId } }` preserved; existing M-Pesa automation untouched.

## 12. Accessibility

Radiogroup payment/channel controls with labels; `role="alert"` errors with
focus moved to the message; `aria-live` processing/copy announcements;
labelled code input with hint + `aria-invalid`; keyboard-native copy buttons
with accessible names; `JBConfirmDialog` focus trap retained; no
color-only signaling (icons + text + tones); theme tokens only.

## 13. Responsive Design

Payment panes stack; order summary remains below the form on mobile;
copy buttons wrap with ≥44px targets; CTA stays visible; no horizontal
overflow by construction (grid + wrap). Breakpoint matrix (320–1440px) was
**not** executed in a browser — CSS follows existing tested patterns.

## 14. Tests

New: `apps/web/lib/business-contact.test.ts` (exact values, validation,
SSR-safe copy), `apps/api/src/lib/payments/manual.test.ts` (reference
validation + error codes). Existing: checkout-input contract, provider
boundaries, full payments matrix. Full suite: **58 files / 475 tests
passed**. `typecheck` PASS, `lint` PASS (one pre-existing unused-var warning
in `storefront.ts`, pre-existing `next/image` warnings on web), `build`
PASS (API + web).

## 15. Runtime Validation

Static verification executed: typecheck, lint, unit/integration suite
(includes Daraja-mocked payment matrix against a live test database), and
production build. **Not performed:** live browser pass, screen-reader pass,
device-breakpoint sweep, real/sandbox Daraja STK round-trip for the new UI.

## 16. Remaining Limitations

- No live end-to-end STK or manual-verify round-trip was exercised in this
  phase; sandbox verification is recommended before launch.
- Manual verification relies on staff confirming the M-Pesa receipt
  off-system (no Daraja receipt lookup); amount-match is enforced, receipt
  authenticity is procedural.
- Checkout payment choice is advisory until order creation; the binding
  payment action happens on the confirmation page.
- Visual breakpoint sweep and assistive-technology pass remain NOT VERIFIED.

---

```text
JB CHECKOUT PAYMENT UX UPGRADE STATUS

Header Contact & Delivery Message:
PASS

Checkout UX:
PASS

Automated M-Pesa:
PASS

Manual M-Pesa Fallback:
PASS

Manual Payment Verification:
PASS

Payment Security:
PASS

Loading/Alerts:
PASS

Responsive:
PARTIAL

Accessibility:
PARTIAL

Tests:
PASS

Build/Typecheck/Lint:
PASS

Documentation:
PASS
```
