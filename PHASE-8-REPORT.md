# PHASE 8 REPORT

## Executive Summary

Phase 8 adds the operational fulfillment and delivery layer for verified paid orders. Fulfillment is represented by the existing `Order.fulfillmentStatus` plus transactional `OrderStatusHistory`; delivery now has its own lifecycle and `DeliveryStatusHistory`. This avoids creating a duplicate full fulfillment aggregate while supporting whole-order V1 operations.

Inventory is not changed by fulfillment actions. Phase 7 remains responsible for converting reservations and decrementing stock after verified payment.

## Scope

Implemented:

- paid-only fulfillment queue
- processing, picked, and packed workflow
- pickup lifecycle
- local/courier delivery lifecycle
- staff/admin authorization
- delivery assignment to operations users
- internal tracking number generation
- delivery status history
- customer-safe delivery status and timeline
- courier-neutral provider interface
- delivery API DTOs and route validation
- noindex staff/customer operational pages
- migration, seed permissions, tests, and documentation

Not implemented:

- live courier provider integration
- partial shipments and split fulfillment
- returns/refunds
- driver/fleet management
- route optimization
- pickup-location management
- email/SMS notification delivery
- Phase 9 features

## Architecture

The domains remain separate:

```text
Order -> Payment -> Fulfillment -> Delivery
                    |
                    -> Inventory remains authoritative
```

A separate `Fulfillment` table was not added because V1 is whole-order fulfillment and the existing `Order`, `Delivery`, and history models are sufficient. Item-level partial fulfillment is a documented future extension.

## Fulfillment Lifecycle

The operational workflow is:

```text
Order paymentStatus=PAID
  -> Order.fulfillmentStatus=PROCESSING / Delivery.PREPARING
  -> Delivery.PICKED
  -> Order.fulfillmentStatus=PACKED / Delivery.PACKED
  -> pickup: Delivery.READY_FOR_PICKUP
  -> delivery: Delivery.ASSIGNED or IN_TRANSIT
```

Only paid, non-cancelled orders can start. Repeated or illegal transitions are rejected transactionally.

## Delivery Lifecycle

The delivery state machine is:

```text
PENDING -> PREPARING -> PICKED -> PACKED
PACKED -> READY_FOR_PICKUP -> PICKED_UP
PACKED -> ASSIGNED -> IN_TRANSIT -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> DELIVERY_ATTEMPTED -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> DELIVERED
```

`FAILED`, `CANCELLED`, and `RETURNED` are represented for future operational workflows but are not freely assignable through the current generic transition endpoint. Delivery completion sets fulfillment to `DELIVERED` and order status to `COMPLETED`; it never changes payment state.

## Order Integration

Fulfillment actions update only the relevant order status fields and create order status history. Payment remains independently authoritative. Cancelled or unpaid orders cannot enter normal fulfillment.

## Payment Integration

Phase 7 verified payment is the gate. Fulfillment never trusts frontend payment state and never directly marks payment paid.

## Inventory Integration

No fulfillment endpoint writes inventory. Phase 7 converts active reservations and performs the stock decrement during verified payment. This prevents double decrementing when staff pick or pack an order.

## Delivery Methods

The existing `ShippingMethodType` supports `PICKUP`, `LOCAL_DELIVERY`, and `COURIER`. Checkout now persists shipping zone, method, recipient, and address details on `Delivery` as well as the order snapshot. No prices or zones are hard-coded in fulfillment logic.

Pickup uses `READY_FOR_PICKUP` and `PICKED_UP`. Local delivery uses assignment and transit states. Courier is courier-ready but has no live provider configured.

## Courier Abstraction

`DeliveryProvider` defines `createShipment`, `getShipmentStatus`, and optional cancellation. `NoopCourierProvider` is a safe internal placeholder and does not contact a courier. Provider adapters must not mutate orders, payments, or inventory directly.

## Database Changes

- `DeliveryStatus` enum with operational delivery states
- `Delivery` status changed from coarse `FulfillmentStatus` to `DeliveryStatus`
- delivery zone, assignee, recipient, address, instructions, provider shipment, tracking, and lifecycle timestamps
- unique internal delivery reference and tracking number
- `DeliveryStatusHistory` with actor, transition, note, and provider-event reference
- operational indexes for status, assignee, provider shipment, and timeline queries
- fulfillment/delivery permissions added to development seed

Migration: `prisma/migrations/20260917_phase8_fulfillment_delivery/migration.sql`.

## API Documentation

Base path: `/api/v1`.

### `GET /admin/fulfillments`

Staff/admin only. Returns paid, non-cancelled delivery work ordered by creation time. Optional `status` filter.

### `GET /admin/fulfillments/:orderNumber`

Staff/admin only. Returns the operational delivery DTO and transition history.

### `POST /admin/fulfillments/:orderNumber/start`

Staff/admin only. `PENDING -> PREPARING`, order fulfillment becomes `PROCESSING`.

### `POST /admin/fulfillments/:orderNumber/pick`

Staff/admin only. `PREPARING -> PICKED`.

### `POST /admin/fulfillments/:orderNumber/pack`

Staff/admin only. `PICKED -> PACKED`, order fulfillment becomes `PACKED`.

### `POST /admin/deliveries/:deliveryId/assign`

Staff/admin only. Assigns a staff/admin operations user and moves `PACKED -> ASSIGNED`.

### `POST /admin/deliveries/:deliveryId/status`

Staff/admin only. Accepts a validated `DeliveryStatus` and optional note. The service enforces legal transitions and method-specific rules.

### `GET /orders/:orderNumber/delivery`

Customer-safe. Requires authenticated ownership or the Phase 6 guest confirmation token. Returns status, method, zone name, tracking, estimated timestamps, and public timeline only. Recipient/address/staff-sensitive fields are omitted.

## RBAC

The current repository has role-based middleware rather than complete permission middleware. Operational routes require `staff`, `admin`, or `super_admin`. Seed permissions `fulfillment.view`, `fulfillment.process`, and `delivery.manage` are added to support future granular authorization without weakening the current role boundary.

## Customer UX

The private order confirmation page now loads delivery status and displays a safe delivery timeline and tracking reference. It does not expose full address, phone, staff assignment, or internal notes. The page remains `noindex` and refreshes from backend state.

## Staff UX

`/admin/fulfillment` provides a responsive operational queue with paid-order filtering by current backend state and buttons for start, pick, pack, pickup completion, shipping, out-for-delivery, and delivery completion. The API remains authoritative; the UI does not accept arbitrary status updates outside the validated route.

## Notifications and Events

No notification provider exists in the repository. This phase creates durable status history hooks that future notification/event consumers can use. No email or SMS system was introduced.

## Security

- operational mutations require server-side staff/admin role authorization
- customers cannot call admin routes successfully
- customer delivery access derives from authenticated owner or secure guest confirmation token
- order number and tracking number are not credentials
- state transitions are validated centrally and transactionally
- assignment accepts only active operations-role users
- public/customer DTOs omit address, phone, assignee, and internal notes
- text inputs are length-validated by Zod
- no frontend status is trusted

## Testing

Added unit coverage for pickup, local-delivery, retry, bypass, and terminal transition rules. Existing auth, catalogue, shopping, and payment tests remain in place.

Final repository checks should include `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx prisma validate`, and live migration/integration tests after PostgreSQL credentials are corrected.

## Performance

Queue queries use indexed delivery status/created time and include operational data in bounded Prisma queries. Customer tracking returns one delivery with its ordered history. No per-item fulfillment requests are made.

## Business Decisions Required

- `UNKNOWN — REQUIRES BUSINESS DECISION`: actual pickup locations and operating hours.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: supported counties/towns and production delivery zones/rates.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: local delivery assignment model and staff visibility scope.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: failed-delivery retry limit and return-to-store policy.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: proof-of-delivery requirements.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: customer notification channels and delivery estimates/SLA.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: courier provider and credentials.

## Known Limitations

- Live database migration and DB-backed manual QA remain blocked by PostgreSQL `P1000` credentials.
- No live courier API or courier webhook is implemented.
- Whole-order fulfillment only; no partial shipment support.
- Delivery `FAILED`, `CANCELLED`, and `RETURNED` are schema-ready but do not have dedicated workflows yet.
- Staff/admin role middleware is currently coarser than the seeded permission metadata.
- No notification worker/provider exists.

## Invariants

- Order is not Payment, Fulfillment, or Delivery.
- Payment verification precedes normal fulfillment.
- Fulfillment never mutates inventory.
- Customers cannot modify fulfillment or delivery state.
- Delivery transitions are backend-authoritative and history-backed.
- Historical order and delivery snapshots remain stable.
- Shipping prices are not hard-coded in fulfillment logic.
- Courier providers remain behind an abstraction.
- Private operational pages are not indexed.

## Stop Condition

PHASE 8 implementation is complete and intentionally stops before Phase 9.
