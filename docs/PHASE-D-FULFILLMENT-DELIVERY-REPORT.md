# Phase D — Fulfillment, Delivery & Order Operations Report

Status: IMPLEMENTED. Builds on Phases A–C. No returns/refunds, no courier API, no redesign, no fake data, no schema migration needed (existing schema covered everything; audit events reuse the existing `ORDER_UPDATED` action per codebase precedent).

## 1. Executive Summary

The audit found a mature fulfillment domain: delivery state machine, payment gate, method guards, atomic per-move concurrency claims, append-only histories, outbox notifications, queue/detail/admin/customer UIs, and a 14-test integration matrix. This session closed the remaining genuine gaps and added the missing staff capabilities:

1. **No audit-log coverage for fulfillment** — moves wrote `DeliveryStatusHistory`/`OrderStatusHistory` but zero `AuditLog` rows. Fixed: every transition, assignment, and courier/ETA edit now writes an `AuditLog` (`ORDER_UPDATED`, entity `Delivery`, actor, before/after) inside the same transaction.
2. **No authoritative eligibility check** — only `assertPaid` guarded fulfillment start. Fixed: new `checkEligibility()` (paid, not cancelled, items, method, address/phone for non-pickup, CONVERTED reservations) enforced with `409 FULFILLMENT_INELIGIBLE` when fulfillment begins, and exposed read-only at `GET /admin/fulfillments/:orderNumber/eligibility` so admin UIs never duplicate the logic.
3. **Admin order detail was read-only** — operators had to jump to the queue. Fixed: new `AdminOrderFulfillmentPanel` (state-aware actions, staff assignment, courier/ETA editing, eligibility banner, confirms, busy guards, re-fetch on success).
4. **Queue hardening** — order numbers now deep-link to the admin order page; Ready-for-pickup and Out-for-delivery join Ship/Deliver/Pickup behind the accessible confirm dialog.
5. Earlier-found issues (concurrent duplicate transitions, assign-path payment gate, customer payload internal leak, missing courier/ETA write path) remain fixed and covered by tests.

Validation: **306/306 tests pass (42 files)**, typecheck clean (api + web), lint 0 errors, api + web builds pass, `git diff --check` clean, no conflict markers.

## 2. Existing Fulfillment Architecture

Preserved and extended, not replaced. Single source of truth remains `apps/api/src/lib/fulfillment.ts`:

- `Delivery` (method/zone FKs, recipient + address snapshot JSON, instructions, courier/tracking/ETA, shipped/picked-up/delivered timestamps, unique `internalReference`/`trackingNumber`) + `DeliveryStatusHistory` (actor, note) + `Order.fulfillmentStatus` + `OrderStatusHistory` + notification outbox events.
- All mutations funnel through `moveDelivery` (start/pick/pack/generic status), except assignment (own transaction, same guards) and details edits (state- and finance-neutral).
- New in this session: `checkEligibility()` / `assertEligibleToStart()` / `fulfillmentEligibility()` and `auditDelivery()` in the same module; `GET .../eligibility` route; `pickedUpAt` added to the admin order serializer.

## 3. Order State Machine

Actual enum preserved (`OrderStatus`: `PENDING → CONFIRMED → PROCESSING → COMPLETED`, plus terminal `CANCELLED`):

- `PENDING → CONFIRMED`: payment callback only (Phase C choke point).
- `→ PROCESSING`: first fulfillment move (`PENDING → PREPARING` on delivery).
- `→ COMPLETED`: terminal delivery move (`DELIVERED` / `PICKED_UP`).
- `CANCELLED` blocks all fulfillment (`ORDER_CANCELLED` 409). No order-cancel endpoint exists (pre-existing; returns phase scope).

## 4. Fulfillment State Machine

`UNFULFILLED → PROCESSING → PACKED → SHIPPED → DELIVERED` (`FulfillmentStatus`; `RETURNED` reserved for the later returns phase). Derived deterministically from delivery moves — never set directly by clients:

- `PICKED → PROCESSING`, `PACKED → PACKED`, transit (`ASSIGNED`/`IN_TRANSIT`/`OUT_FOR_DELIVERY`) → `SHIPPED`, terminal (`DELIVERED`/`PICKED_UP`) → `DELIVERED`.

## 5. Delivery State Machine

`PENDING → PREPARING → PICKED → PACKED → {READY_FOR_PICKUP → PICKED_UP | ASSIGNED → IN_TRANSIT → OUT_FOR_DELIVERY → {DELIVERED | DELIVERY_ATTEMPTED ↔ OUT_FOR_DELIVERY} }`, plus `FAILED`/`CANCELLED`/`RETURNED` terminal set. Central `transitions` map + exported `isLegalDeliveryTransition` (unit-tested in `lib/fulfillment.test.ts`); method-type guards (pickup never transits, local requires assignment, courier/pickup exclusivity). No new statuses introduced. Every transition is atomic-claimed (`updateMany` on expected from-status; losers get controlled 409), so double-clicks and concurrent staff actions collapse to one winner.

## 6. Payment-to-Fulfillment Gate

Two layers, both enforced backend-side:

- `assertPaid` (`paymentStatus === PAID`, not `CANCELLED`) runs in `moveDelivery` (all moves), `assignDelivery`, and `updateDeliveryDetails`. Queue lists only paid, non-cancelled deliveries.
- New: `assertEligibleToStart` additionally requires full eligibility when fulfillment begins (leaving `PENDING`). `UNPAID → SHIPPED` is impossible for prepaid orders (409 `ORDER_NOT_PAID`); no cash-on-delivery model exists in this codebase, none invented.

## 7. Inventory Interaction

Fulfillment is stock-neutral by design: reservations convert at payment (Phase C `OUT`/`PAYMENT_CONFIRMED` guarded decrement); fulfillment moves touch zero inventory rows. Proven by the neutrality test (reserved/on-hand deltas zero across a full lifecycle; only the payment-time conversion stands). No second deduction point, no new movements, no negative stock. The new eligibility gate additionally refuses to start fulfillment when reservations are missing or not `CONVERTED`, surfacing reconciliation cases explicitly instead of fulfilling against unbacked stock.

## 8. Shipping Zones and Rates

Unchanged, database-driven (`ShippingZone`/`ShippingMethod`/`ShippingRate`; checkout exposes ACTIVE only, resolves by `minOrderValue desc`). Post-confirmation immutability proven by test: mutating zone name, rate price, product price, and address after order creation leaves order totals/items/snapshots byte-identical (fixtures restored afterward). No hard-coded rates anywhere; unsupported zones fail checkout with `CHECKOUT_SHIPPING_UNAVAILABLE`.

## 9. Pickup Workflow

`PACKED → READY_FOR_PICKUP → PICKED_UP` (`pickedUpAt` recorded; no tracking number, no courier; now also surfaced in the admin order payload). Tested end-to-end including refusal of transit/pickup cross-transitions. Staff UI: Ready-for-pickup and Complete-pickup both confirm; pickup completion no longer requires tracking.

## 10. Local Delivery Workflow

`PACKED → ASSIGNED (operations user only) → IN_TRANSIT → …`; direct `PACKED → IN_TRANSIT` rejected with 409. Assignee validated against operations roles (400 otherwise). Customer phone/address snapshot already on the delivery row for staff use. Admin order panel renders the assign control only for `LOCAL_DELIVERY` in `PACKED` state.

## 11. Courier Workflow

`PACKED → IN_TRANSIT` (backend-generated `VYR-YYYYMMDD-HEX` tracking, `shippedAt`) `→ OUT_FOR_DELIVERY → DELIVERED` (`deliveredAt`, order `COMPLETED`). Courier name + ETA editable via `POST /admin/deliveries/:deliveryId/details` (state- and finance-neutral, history- and audit-recorded), now also editable from the admin order page. Manual courier tracking supported; automated courier API integration explicitly deferred (no fake integration; `NoopCourierProvider` internal only).

## 12. RBAC

Unchanged architecture, verified by tests: all operations endpoints require `requireOperationsAccess` (customer 403, anonymous 401); assignment restricted to operations users; customers can never transition/assign/edit details; owner-scoped customer reads (session userId or confirmation-token hash; strangers get 404); the new eligibility endpoint is operations-gated (403/404 verified); financial fields (`subtotal`, `shippingTotal`, `grandTotal`) have no write path anywhere in fulfillment.

## 13. API Endpoints

| Method/Path | Auth | Notes |
| ----------- | ---- | ----- |
| `GET /admin/fulfillments[?status]` | operations | paid, non-cancelled queue |
| `GET /admin/fulfillments/:orderNumber` | operations | full detail + history |
| `GET /admin/fulfillments/:orderNumber/eligibility` (new) | operations | `{ eligible, reasons, orderNumber, deliveryStatus }` |
| `POST /admin/fulfillments/:orderNumber/{start,pick,pack}` | operations | legal-transition + paid + eligibility (on start), atomic claim |
| `POST /admin/deliveries/:deliveryId/assign` | operations | PACKED-only claim + paid gate + staff assignee |
| `POST /admin/deliveries/:deliveryId/status` | operations | any legal transition, method guards, claim |
| `POST /admin/deliveries/:deliveryId/details` | operations | courier/ETA only + history note + audit; 400 on empty/invalid |
| `GET /orders/:orderNumber/delivery` | owner (session/token) | stripped customer payload |
| `GET /admin/orders`, `GET /admin/orders/:orderNumber` | operations | read-only list/detail (now includes `pickedUpAt`) |

Error contract preserved (`{ success, error: { code, message, details, requestId } }`): 400 validation, 401 unauthenticated, 403 forbidden, 404 not-found-or-not-yours, 409 state conflict (`ORDER_NOT_PAID`, `INVALID_DELIVERY_TRANSITION`, `FULFILLMENT_INELIGIBLE`). No stack traces to clients.

## 14. Customer Experience

Unchanged pages, verified payloads: account order detail (payment/fulfillment/delivery states), tracking page (method, zone, tracking + courier, ETA/ship/deliver timestamps, real history timeline), order list badges. No fake data; no success-equals-delivered confusion; internal identifiers and staff notes stripped from customer payloads.

## 15. Admin/Staff Experience

- Queue: status-filtered, method-aware actions, busy guards, inline errors, manual refresh; order numbers now link to the order page; all customer-facing transitions (ship, out-for-delivery, ready-for-pickup, delivered, picked-up) confirm via `useConfirm`/`JBConfirmDialog`.
- Order detail: new `AdminOrderFulfillmentPanel` per delivery — current state, eligibility banner with reasons, state-appropriate actions, local-delivery staff assignment, courier/ETA editor, unpaid banner disabling actions. Parent order re-fetches after each mutation (no `window.location.reload()`, no `window.confirm` anywhere).
- No broad redesign; existing JB design tokens and components only.

## 16. Notifications

Existing outbox events (`ORDER_PROCESSING`/`PACKED`/`SHIPPED`/`OUT_FOR_DELIVERY`/`DELIVERED`/`READY_FOR_PICKUP`/`DELIVERY_FAILED`) fire inside the business transaction from backend events only; exactly-once per transition proven (duplicate-transition test asserts single outbox rows). `PICKED` intentionally silent. New audit writes are separate from notifications — no extra notification noise.

## 17. Security

Backend-authoritative transitions; IDOR/BOLA tested (stranger 404s, customer 403s on all fulfillment paths including the new eligibility endpoint); no financial write path; internal identifiers stripped from customer payloads; recipient PII admin-only. Audit trail per move: append-only `DeliveryStatusHistory` (actor) + `OrderStatusHistory` (`changedBy`) + new `AuditLog` (`ORDER_UPDATED`, entity `Delivery`, actor, before/after). Verified: 401 anonymous, 403 customer on all ops routes; customer cannot mutate tracking, costs, or other customers' deliveries.

## 18. Test Results

- `apps/api/src/routes/fulfillment.test.ts` (14 integration tests, real API+DB): gate, RBAC fencing, illegal/terminal transitions, full courier lifecycle, concurrency collapse, pickup lifecycle + guards, local assignment matrix, details endpoint + fencing + validation, internal-strip, ownership scoping, snapshot immutability, inventory neutrality, exactly-once notifications. Extended with audit cleanup + details-audit assertion.
- `apps/api/src/routes/fulfillment-eligibility.test.ts` (new, 3 tests): eligibility reporting (paid/unpaid/unknown/RBAC), start-refusal on unconverted reservations (`FULFILLMENT_INELIGIBLE`) with recovery, per-transition audit rows with actor.
- `apps/api/src/lib/fulfillment.test.ts` (3 unit tests): state-machine legality incl. pickup/transit separation and terminal irreversibility.
- Full suite: **306/306 PASS (42 files)**. Note: the new tests live in a separate file because the in-memory per-app rate limiter (100 req/window) tripped when all fulfillment checkouts shared one file; per-file app instances each get a fresh budget.

## 19. Browser Validation

**PARTIAL** — no automated browser harness exists in this environment, so staff/customer flows were validated at the API + payload level (integration tests) and by build/typecheck. Manual QA still recommended: staff queue flow and order-page panel (light/dark, mobile/desktop widths), customer tracking pages. What changed on the client is additive UI over already-tested endpoints; no `window.confirm`/`alert`/`location.reload` introduced (grep-clean).

## 20. Known Limitations

- No courier API (manual tracking by design); no ETA auto-computation.
- No background stale-sweep for stuck deliveries (explicit staff action only).
- `DELIVERY_ATTEMPTED`/`FAILED` settable but no redelivery workflow (returns phase).
- No order-cancel endpoint (pre-existing; out of scope).
- Eligibility enforcement applies at fulfillment start; later moves rely on the paid-gate + transition guards (payment never downgrades from PAID, so this is sound).
- `apps/web/tsconfig.tsbuildinfo` build artifact was swept into the session commit; harmless.

## 21. Deferred Work

Returns/exchanges/refunds (later phase), courier API integration, delivery SLA engine, customer rescheduling workflow, automated browser QA harness.

## 22. Production Risks

Staff error mitigated by confirms + atomic claims + eligibility reasons; history/audit complete per move; no financial mutation surface. Operational risk is process (who ships what), not system integrity. Rate-limit budgets (100 global / 30 sensitive per window) are per-IP: fine for real staff traffic; only dense integration suites need file-splitting. No migration was required, so deploy is code-only with zero data risk.

## 23. Final Status

```text
PHASE D STATUS

Order Operations: PASS
Fulfillment: PASS
Pickup: PASS
Local Delivery: PASS
Courier: PASS (manual tracking; API integration deferred by design)
Shipping Zones: PASS
Shipping Rates: PASS
Tracking: PASS
Inventory Interaction: PASS
RBAC/Security: PASS
Notifications: PASS
Customer Experience: PASS
Admin/Staff Experience: PASS
Tests: PASS (17 new/extended assertions across 3 files; 306/306 suite)
Typecheck: PASS (api + web)
Lint: PASS (0 errors; pre-existing warnings only)
Build: PASS (api tsc + web Next.js)
Browser Validation: PARTIAL (API/payload verified; manual light/dark + mobile/desktop QA recommended)
Documentation: PASS
```

```text
Critical Findings
- Fulfillment wrote no AuditLog rows (fixed: ORDER_UPDATED per transition/assign/details-edit, same-transaction, tested).
- No authoritative eligibility check; start required only PAID (fixed: checkEligibility enforced on start + read endpoint, tested incl. FULFILLMENT_INELIGIBLE recovery).
- Admin order detail was read-only for fulfillment (fixed: AdminOrderFulfillmentPanel with actions, assignment, courier/ETA editing, eligibility banner).
- Queue lacked order deep-links and two confirms (fixed: links + Ready-for-pickup/Out-for-delivery confirms).
- Earlier: concurrent duplicate transitions, assign-path gate gap, customer payload internal leak, missing courier/ETA write path (all previously fixed; still green).
Known Limitations
- Manual courier tracking only; no ETA automation; no stuck-delivery sweeper; no redelivery workflow; no order-cancel endpoint.
Deferred Items
- Returns/exchanges/refunds, courier API, SLA engine, customer rescheduling, browser QA harness.
Production Risks
- Process-level (who ships what); system integrity covered by atomic claims, confirms, eligibility reasons, audit trail. Code-only deploy, no migration risk.
Recommended Next Phase
- Returns/exchanges/refunds (explicitly out of scope here). STOP after Phase D.
```
