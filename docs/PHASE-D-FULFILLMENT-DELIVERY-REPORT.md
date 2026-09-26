# Phase D — Fulfillment, Delivery & Order Operations Report

Status: IMPLEMENTED. Builds on Phases A–C. No returns/refunds, no courier API, no redesign, no fake data, no migrations needed (existing schema covered everything).

## 1. Executive Summary

The audit found a complete fulfillment domain (transition map, payment gate, method guards, atomic-per-move transactions, histories, notifications, queue/detail/admin/customer UIs). Phase D fixed its three genuine gaps and added the one missing staff capability:

1. **Concurrent duplicate transitions double-processed** — two simultaneous moves both read the old status and both wrote history + notifications (`buildEvent` uses random ids). Fixed: atomic `updateMany` claims on the expected from-status in `moveDelivery` and `assignDelivery`; losers get controlled 409.
2. **Assign path skipped the payment/cancel gate** — `assignDelivery` checked `PACKED` but not `assertPaid`. Fixed with one gate call.
3. **Customer tracking payload leaked internals** — `internalReference` (+ `providerShipmentId`) shipped to browsers though never displayed. Stripped; typed `CustomerTracking` contract added.
4. **No courier/ETA write path** — tracking numbers auto-generate, but staff could never set courier name or ETA. Added audited `POST /admin/deliveries/:deliveryId/details` (state- and finance-neutral, history-recorded).
5. Consequential staff actions (Ship / Mark delivered / Complete pickup) now confirm via the existing accessible dialog (no `window.confirm`), keeping primary-button styling and busy guards.

## 2. Existing Fulfillment Architecture

Preserved: `Delivery` (method/zone FKs, recipient + address snapshot JSON, instructions, courier/tracking/ETA fields, shipped/picked-up/delivered timestamps, unique `internalReference`/`trackingNumber`) + `DeliveryStatusHistory` (actor, note) + `Order.fulfillmentStatus` + `OrderStatusHistory` + notification outbox events. All mutations funnel through `moveDelivery` (start/pick/pack/generic status) except assignment (own transaction, same guards).

## 3. Order State Machine

`PENDING → CONFIRMED` (payment callback) `→ PROCESSING` (first fulfillment move) `→ COMPLETED` (delivery terminal), plus `CANCELLED` (terminal, blocks fulfillment). Actual enum names preserved; transitions only via the guarded paths above.

## 4. Fulfillment State Machine

`UNFULFILLED → PROCESSING → PACKED → SHIPPED → DELIVERED` (delivery/pickup map onto it; `RETURNED` reserved for the later returns phase). Derived deterministically from delivery moves — never set directly by clients.

## 5. Delivery State Machine

`PENDING → PREPARING → PICKED → PACKED → {READY_FOR_PICKUP → PICKED_UP | ASSIGNED → IN_TRANSIT → OUT_FOR_DELIVERY → {DELIVERED | DELIVERY_ATTEMPTED ↔ OUT_FOR_DELIVERY → DELIVERED} | IN_TRANSIT → …} + FAILED/CANCELLED`. Central `transitions` map + `isLegalDeliveryTransition` (unit-tested); method-type guards (pickup never transits, local requires assignment, courier/pickup exclusivity). No new statuses.

## 6. Payment-to-Fulfillment Gate

Single choke point `assertPaid` (order `paymentStatus === PAID`, not `CANCELLED`) enforced in `moveDelivery` and now `assignDelivery`; queue lists only paid, non-cancelled deliveries. Verified: UNPAID → 409 `ORDER_NOT_PAID`.

## 7. Inventory Interaction

Fulfillment is stock-neutral by design: reservations convert at payment (Phase C); fulfillment moves touch no inventory rows. Proven by test (reserved/on-hand deltas zero across a full lifecycle; only pre-existing order reservations remain `CONVERTED`). No second deduction point, no new movements.

## 8. Shipping Zones and Rates

Unchanged, database-driven (`ShippingZone/Method/Rate`, ACTIVE-only exposure at checkout). Proven immutable post-confirmation: mutating zone name, rate price, product price, and address after order creation leaves order totals/items/snapshots byte-identical (test restores fixtures afterward).

## 9. Pickup Workflow

`PACKED → READY_FOR_PICKUP → PICKED_UP` (`pickedUpAt` recorded, no tracking number, no courier). Tested end-to-end incl. refusal of transit/pickup cross-transitions.

## 10. Local Delivery Workflow

`PACKED → ASSIGNED (operations user only) → IN_TRANSIT → …`; direct `PACKED → IN_TRANSIT` rejected. Assignee validated against operations roles; customer phone/address snapshot already on the delivery row for staff use.

## 11. Courier Workflow

`PACKED → IN_TRANSIT` (backend-generated `VYR-YYYYMMDD-HEX` tracking, `shippedAt`) `→ OUT_FOR_DELIVERY → DELIVERED` (`deliveredAt`, order `COMPLETED`). Manual courier tracking supported via the new details endpoint; automated courier API integration explicitly deferred (no fake integration).

## 12. RBAC

Unchanged architecture, verified: operations endpoints require `requireOperationsAccess` (customer 403, anonymous 401); assignment restricted to operations users (400 otherwise); customers can never transition/assign/edit details; owner-scoped customer reads (strangers 404); financial fields have no write path anywhere in fulfillment.

## 13. API Endpoints

| Method/Path | Auth | Notes |
| ----------- | ---- | ----- |
| `GET /admin/fulfillments[?status]` | operations | paid, non-cancelled queue |
| `GET /admin/fulfillments/:orderNumber` | operations | full detail + history |
| `POST /admin/fulfillments/:orderNumber/{start,pick,pack}` | operations | legal-transition enforced, atomic claim |
| `POST /admin/deliveries/:deliveryId/assign` | operations | PACKED-only claim + paid gate + staff assignee |
| `POST /admin/deliveries/:deliveryId/status` | operations | any legal transition, method guards, claim |
| `POST /admin/deliveries/:deliveryId/details` (new) | operations | courier/ETA only + history note; 400 on empty/invalid |
| `GET /orders/:orderNumber/delivery` | owner (session/token) | stripped customer payload |

## 14. Customer Experience

Unchanged pages, verified payloads: order detail (payment/fulfillment/delivery states), tracking page (method, zone, tracking + courier, ETA/ship/deliver timestamps, real history timeline with null-notes), no fake data, no success-equals-delivered confusion.

## 15. Admin/Staff Experience

Queue (status-filtered, method-aware actions, busy guards, inline errors, refresh) + order detail (header/status/customer/items+totals/payments+attempts/delivery+recipient/timeline/returns). Added confirms for ship/deliver/pickup. No redesign.

## 16. Notifications

Existing outbox events (`ORDER_PROCESSING/PACKED/SHIPPED/OUT_FOR_DELIVERY/DELIVERED/READY_FOR_PICKUP/FAILED`) fire inside the business transaction; exactly-once per transition proven (duplicate-transition test asserts single outbox rows). PICKED intentionally silent.

## 17. Security

Backend-authoritative transitions; IDOR/BOLA tested (stranger 404s, customer 403s); no financial write path; internal identifiers stripped from customer payloads; notes stripped from customer history; recipient PII admin-only. Audit trail = append-only delivery history (actor) + order history (`changedBy`) — complete per move, no new noise.

## 18. Test Results

New `apps/api/src/routes/fulfillment.test.ts` (14 integration tests, real API+DB): gate, RBAC fencing, illegal/terminal transitions, full courier lifecycle with mirroring/tracking/timestamps, concurrency collapse, pickup lifecycle + guards, local assignment matrix, details endpoint + fencing + validation, internal-strip, ownership scoping, snapshot immutability, inventory neutrality, exactly-once notifications. Full suite: **303/303 PASS (41 files)**. Suite-reliability work included: server-side bounded retry for transient checkout write conflicts (safe — rolled-back transactions, nothing external pre-commit) and scoped cart cleanups in checkout-heavy suites (previously full-table sweeps deadlocked live checkouts).

## 19. Browser Validation

**NOT VERIFIED** — no browser harness in this environment (staff queue flow + customer tracking, light/dark, mobile/desktop remain manual QA).

## 20. Known Limitations

- No courier API (manual tracking by design); no ETA auto-computation.
- No background stale-sweep for stuck deliveries (explicit staff action only).
- `DELIVERY_ATTEMPTED/FAILED` settable but no redelivery workflow (returns phase).

## 21. Deferred Work

Returns/exchanges/refunds (later phase), courier API integration, delivery SLA engine, customer rescheduling workflow.

## 22. Production Risks

Staff error mitigated by confirms + atomic claims; history/audit complete; no financial mutation surface. Operational risk is process (who ships what), not system integrity.

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
Tests: PASS (14 new; 303/303 suite)
Typecheck: PASS
Lint: PASS (0 errors)
Build: PASS (59/59 routes)
Browser Validation: NOT VERIFIED (no harness)
Documentation: PASS (report; docs/PAYMENTS.md updated in Phase C)
```

```text
Critical Findings
- Concurrent duplicate fulfillment transitions double-processed (fixed via atomic claims, tested).
- Assign path missing payment/cancel gate (fixed).
- Customer payload leaked internal identifiers (stripped, typed).
- Missing courier/ETA write path (added, audited, tested).
Known Limitations / Deferred Items / Production Risks: see §§20–22.
Recommended Next Phase: Returns/exchanges/refunds (explicitly out of scope here).
```
