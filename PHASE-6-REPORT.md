# PHASE 6 REPORT

## Executive Summary

Phase 6 transforms Phase 5 cart intent into a server-validated, transactional, payment-ready order. It adds checkout preview, guest and authenticated checkout, customer/address validation, configured shipping resolution, authoritative totals, immutable order snapshots, inventory reservations, delivery creation, status history, secure confirmation retrieval, and idempotent order placement.

M-Pesa, card processing, payment callbacks, payment verification, refunds, and advanced courier integrations remain intentionally excluded.

## Scope

Implemented:

- `/checkout` customer flow
- Guest checkout and authenticated checkout
- Customer name, email, and Kenyan/international phone normalization
- Address validation and authenticated saved-address ownership checks
- Configured shipping method, zone, and rate resolution
- Server-backed checkout preview
- Final server-side price and stock revalidation
- Serializable order transaction
- Conditional inventory reservation update
- Inventory reservation and `RESERVED` movement records
- Order and order-item historical snapshots
- Delivery record and initial order status history
- Guest confirmation token and authenticated order access
- Idempotency key storage and replay handling
- Responsive confirmation page
- Private-page `noindex` metadata

Excluded:

- M-Pesa or other payment providers
- Payment callbacks or verification
- Refunds
- Order history dashboard
- Courier APIs
- Tax and coupon engines
- Customer cancellation workflow

## Repository Changes

- `prisma/schema.prisma`: customer-name and confirmation-token snapshots plus `CheckoutIdempotency`
- `prisma/migrations/20260917_phase6_checkout_order/migration.sql`: Phase 6 migration
- `apps/api/src/lib/checkout.ts`: checkout validation, shipping resolution, totals, order transaction, reservations, idempotency, and confirmation authorization
- `apps/api/src/routes/checkout.ts`: checkout options, preview, place-order, order confirmation, and saved-address endpoints
- `apps/api/src/app.ts`: checkout route registration
- `apps/api/src/lib/errors.ts`: structured business error details
- `apps/web/lib/shopping-api.ts`: checkout and order DTOs/client calls
- `apps/web/components/CheckoutPageClient.tsx`: checkout form and review/place-order flow
- `apps/web/components/OrderConfirmationClient.tsx`: confirmation UI
- `apps/web/app/checkout/page.tsx`: private checkout route
- `apps/web/app/order-confirmation/[orderNumber]/page.tsx`: private confirmation route
- `apps/web/components/CartPageClient.tsx`: checkout entry point

## Database Changes

`Order` now stores `customerName` and a unique `confirmationTokenHash`. `CheckoutIdempotency` stores the idempotency key, scope, request fingerprint, optional user, and resulting order reference. Existing `InventoryReservation`, `InventoryMovement`, `OrderItem`, `OrderStatusHistory`, `Delivery`, `ShippingZone`, `ShippingMethod`, and `ShippingRate` models are reused without duplicate order architecture.

## Checkout Architecture

The browser collects intent. The API resolves the current cart from the authenticated session or guest cart cookie. The API validates customer input, loads current product/variant/inventory state, resolves shipping from configured records, calculates Decimal totals, and only then creates the order.

Preview and place-order use the same validation and shipping services. Preview is informational and may become stale. Place-order always recalculates inside the transaction.

## Cart Validation and Pricing

Every cart item must belong to an active product and active variant, have a valid quantity, have current available stock, and use current pricing. A changed price produces `CHECKOUT_REQUIRES_UPDATE`; the UI requires explicit confirmation before placement. Frontend prices, shipping, stock, subtotal, and grand total are ignored as authorities.

## Shipping

`resolveShipping()` loads an active `ShippingMethod`, active `ShippingZone`, and active `ShippingRate` whose minimum order value applies. No rate is invented. Missing or unavailable configuration returns `CHECKOUT_SHIPPING_UNAVAILABLE`.

## Inventory

Order creation uses a serializable transaction and an atomic conditional SQL update:

```text
quantityOnHand - quantityReserved >= requested quantity
```

Only the relevant inventory rows are updated. Each successful reservation creates an `ACTIVE` `InventoryReservation`, increments `quantityReserved`, and creates an auditable `RESERVED` `InventoryMovement`. `quantityOnHand` is not reduced at reservation time.

## Order Architecture

New orders begin as:

- `PENDING`
- `UNPAID`
- `UNFULFILLED`

Each order receives a server-generated unique `ORD-YYYYMMDD-XXXXXXXX` number. Order items snapshot product name, SKU, variant attributes, price, quantity, subtotal, and total. The shipping address and resolved delivery method/zone are stored in `shippingAddressSnapshot`. A `Delivery` and initial `OrderStatusHistory` record are created in the same transaction.

## Guest Checkout

Guest orders use `userId = null`, preserve customer contact details directly on the order, and receive a random confirmation token. Only the hash is stored. Confirmation retrieval requires the token or an authenticated owner session; guessing an order number alone returns not found.

## Authenticated Checkout

Authenticated ownership is derived from the existing `veyra_session` cookie. Saved address selection verifies `address.userId` against the current principal. The request cannot supply an authoritative `userId`.

## Idempotency

`POST /api/v1/checkout` requires an `Idempotency-Key` header. The key is scoped to the current user or guest cart and stores a hash of the cart/input request. Replaying the same key and request returns the original order. Reusing it with a different request returns `CHECKOUT_DUPLICATE_REQUEST`.

## Security

- Cart ownership is resolved server-side.
- Saved addresses are owner-checked.
- Order confirmation uses authenticated ownership or a random confirmation token.
- Order number is not an authentication credential.
- Prices, inventory, shipping, totals, user IDs, and order statuses are server-controlled.
- Customer text is length-limited and stored as plain data.
- DTOs exclude cost, supplier, audit, and internal inventory details.
- Existing global Fastify rate limiting applies to checkout endpoints.

## API Documentation

Base path: `/api/v1`

### `GET /checkout/options`

Public. Returns currently configured active shipping methods and zones.

### `POST /checkout/preview`

Guest or authenticated. Loads the current cart and accepts customer/delivery input. Returns authoritative current item prices, subtotal, shipping, total, method, zone, and price-change warnings. Does not create an order.

### `POST /checkout`

Guest or authenticated. Requires `Idempotency-Key`. Accepts the same checkout input plus optional `confirmPriceChanges`. Creates one transactional order, reservations, movement records, delivery, history, and finalizes the cart.

### `GET /orders/:orderNumber`

Authenticated owners may retrieve their order. Guests must provide the confirmation token as `token` query parameter or `x-confirmation-token` header. Other callers receive `ORDER_NOT_FOUND`.

### `GET /checkout/saved-addresses`

Authenticated only. Returns only the current user's saved addresses without `userId`.

## UI/UX

- `/checkout` is a responsive form with customer information, delivery selection, address fields, review state, price-change confirmation, and a server-backed summary.
- `/order-confirmation/[orderNumber]` displays order number, item snapshots, totals, payment state, and fulfillment state.
- Checkout and confirmation pages are `noindex` and are not public catalogue pages.

## Testing and Verification

Fresh verification passed:

- `npm run lint` — passed; Next reports only existing `<img>` optimization warnings in cart/wishlist components
- `npm run typecheck` — passed
- `npm test` — 11 tests passed
- `npm run build` — passed
- `npx prisma validate` — passed

`npx prisma migrate deploy` remains blocked by invalid local PostgreSQL credentials (`P1000` against `localhost:5432`). Full database-backed checkout tests and manual end-to-end tests remain blocked until PostgreSQL credentials are corrected and migrations can be applied.

After database setup, run `npx prisma migrate deploy`, seed the development shipping configuration, and execute DB-backed guest, authenticated, idempotency, rollback, and concurrency tests.

## Performance

Preview and order creation load cart items with product, variant, inventory, and attributes in a bounded query. The transaction updates only relevant inventory rows in deterministic variant order. The browser does not issue one product request per cart item.

## SEO

Checkout and order confirmation pages emit `noindex, nofollow` metadata and are excluded from public catalogue/sitemap behavior.

## Phase 7 Readiness

Phase 7 can consume the returned order number/order ID, `grandTotal`, `currency`, `customerPhone`, and `paymentStatus`. Payment must use the persisted order total and must never reconstruct the amount from the cart or frontend state. Order creation is not payment success.

## State Machines

Order creation uses `PENDING`, payment uses `UNPAID`, and fulfillment uses `UNFULFILLED`. No payment or fulfillment transitions are implemented in Phase 6. Inventory reservations begin as `ACTIVE`.

## Known Limitations

- Live migration is blocked by invalid local PostgreSQL credentials (`P1000`).
- No database-backed integration or concurrency test can run until PostgreSQL is available.
- Shipping zone selection currently uses configured zone codes rather than a geographic county/town resolver.
- Pickup still requires a configured shipping rate and zone; pickup-location-specific data is not modeled.
- Tax and discount totals are explicitly zero because those engines are not established.
- The frontend generates an idempotency key per checkout attempt; retries after a network timeout should reuse the same key in a future dedicated retry-state refinement.

## Business Decisions Required

- `UNKNOWN — REQUIRES BUSINESS DECISION`: exact guest confirmation-token retention and order-access expiry policy.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: whether pickup should use a dedicated configured location model instead of a shipping zone.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: tax and discount policy before payment launch.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: whether order creation should require explicit price confirmation for every preview, even when no price changed.

## Architectural Invariants

- `Cart -> Checkout Validation -> Order -> Payment`
- Cart is not an order.
- Order is not payment.
- Order is not fulfillment.
- Frontend totals are not authoritative.
- Cart availability is not reserved availability.
- Order snapshots are not live catalogue data.
- Order number is not an authentication credential.
- Place Order is not Payment Success.

## Stop Condition

Checkout and order creation are implemented. M-Pesa, card payments, provider integration, callbacks, verification, refunds, and advanced courier APIs are not implemented. Work stops here pending Phase 7.
