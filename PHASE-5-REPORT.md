# PHASE 5 REPORT

## Executive Summary

Phase 5 adds the shopping-intent layer for Veyra: secure guest and authenticated carts, provisional price snapshots, cart validation, product-level wishlists, storefront cart/wishlist pages, and product-page integration. Checkout, orders, payments, M-Pesa, delivery, shipping calculation, and reservations remain out of scope.

## Scope

Included:

- Guest cart persistence through an HTTP-only server-managed cookie
- Authenticated cart ownership through the existing session cookie
- Add, update, remove, clear, retrieve, and validate cart operations
- Variant-level cart identity and duplicate prevention
- Current availability checks without inventory reservation
- Provisional unit-price snapshots and current-price comparison
- Guest-to-user cart merge on the first authenticated cart request
- Product-level authenticated wishlists with duplicate prevention
- Cart and wishlist storefront routes and product-page actions
- Private-page `noindex` metadata

Excluded:

- Checkout and order creation
- Inventory reservation or payment
- Shipping, tax, coupons, reviews, and customer dashboards
- Anonymous wishlists

## Repository Changes

- `prisma/schema.prisma`: cart price snapshot, cart ownership uniqueness/indexing, product-level wishlist relations
- `apps/api/src/lib/shopping.ts`: cart ownership, serialization, quantity/stock rules, merge, and validation service
- `apps/api/src/routes/shopping.ts`: cart and wishlist API routes
- `apps/api/src/app.ts`: shopping route registration
- `apps/web/lib/shopping-api.ts`: typed browser API client
- `apps/web/components/CartPageClient.tsx`: cart UI and mutation states
- `apps/web/components/WishlistPageClient.tsx`: wishlist UI and availability states
- `apps/web/components/ProductActions.tsx`: selected variant, quantity, add-to-cart, and wishlist actions
- `apps/web/components/WishlistButton.tsx`: accessible wishlist toggle
- `apps/web/app/cart/page.tsx`: private cart route
- `apps/web/app/wishlist/page.tsx`: private wishlist route
- `apps/web/components/Header.tsx`: real cart quantity badge and wishlist navigation
- `prisma/migrations/20260917_phase5_cart_wishlist/migration.sql`: schema migration

## Database Changes

`CartItem` now stores `unitPriceSnapshot`. `Cart` has unique nullable ownership keys for one cart per user/session and an expiry/status index. `Wishlist` now has `updatedAt`. `WishlistItem` references `Product`, has a unique `(wishlistId, productId)` constraint, and no longer references a variant.

The migration backfills existing wishlist rows from their variant's product before removing the old variant foreign key. Existing cart rows receive a temporary `0.00` snapshot default so the migration remains data-safe; application writes always set the current variant price.

## API Documentation

Base path: `/api/v1`

### `GET /cart`

Authentication: optional. Resolves the authenticated cart when a valid session exists, otherwise creates/loads the guest cart from the HTTP-only `veyra_guest_cart` cookie.

Returns public cart DTOs, item count, subtotal, current price, snapshot price, price-change state, product/variant display data, and availability. It never returns cost, supplier, movement, or reservation internals.

### `POST /cart/items`

Authentication: optional.

Request: `{ "variantId": "uuid", "quantity": 1 }`

The server loads the product and inventory, confirms active product/variant state, validates quantity and available stock, then upserts by `(cartId, variantId)`. Client price and stock fields are ignored.

### `PATCH /cart/items/:itemId`

Authentication: optional. Ownership is derived from the current user/session cart before the item is loaded.

Request: `{ "quantity": 3 }`

### `DELETE /cart/items/:itemId`

Authentication: optional. Deletes only an item belonging to the current cart and returns the updated cart.

### `DELETE /cart`

Authentication: optional. Idempotently clears only the current cart.

### `GET /cart/validation`

Authentication: optional. Returns the cart plus `readyForCheckout` and invalid item IDs. This is the Phase 6 validation boundary and does not create reservations.

### `GET /wishlist`

Authentication: required. Returns the current user's product wishlist with current price and availability state.

### `POST /wishlist/items`

Authentication: required.

Request: `{ "productId": "uuid" }`

Uses an upsert keyed by `(wishlistId, productId)` and rejects missing/deleted products.

### `DELETE /wishlist/items/:itemId`

Authentication: required. Deletes only an item owned by the current user's wishlist.

## Cart Architecture

A guest cart is identified by a cryptographically random server-issued cookie value. An authenticated cart is identified from the existing session, never from a client-supplied user ID. Cart items point to `ProductVariant`; duplicate variants are prevented by the database unique constraint and application upsert.

Cart quantities are capped by `MAX_CART_ITEM_QUANTITY` (20), validated as positive integers, and checked against current available stock. Adding to cart never changes inventory or creates a reservation. Cart prices are provisional snapshots; `GET /cart/validation` compares them to current prices for checkout to revalidate later.

## Cart Merge Rules

When an authenticated request arrives with both a user session and a guest cart cookie, the guest cart is merged transactionally:

- overlapping variants sum quantities, capped by the maximum and currently available stock
- guest-only variants move to the user cart
- user-only variants remain
- unavailable guest entries are not copied into the active user cart
- the guest cart is marked `MERGED` and soft-deleted
- the guest cookie is cleared

The operation is safe to repeat because the guest cart is no longer active after the transaction.

## Wishlist Architecture

Wishlists belong to authenticated users and contain products, not variants. Product availability is computed from its active variants and inventory. Unavailable products remain visible with an explicit state so temporary stock loss does not silently erase customer intent. Customers choose a variant on the product page before adding a wishlisted product to cart.

## Security

Ownership always follows `principal -> current cart/wishlist -> item`. Request bodies cannot set user IDs, prices, stock, or totals. Cart and wishlist DTOs are explicit public shapes. Mutation inputs use Zod validation. Guest identity is an HTTP-only, secure-in-production, same-site cookie. Database unique constraints and transactional upserts protect duplicate cart/wishlist rows.

Mutation rate limiting currently inherits the existing global Fastify rate limit. A separate mutation-specific limit remains `UNKNOWN — REQUIRES BUSINESS DECISION`.

## State Management

The web app has no established query library, so server state is kept in focused client components and reconciled from authoritative API responses after every mutation. Drawer state is not introduced; the cart page is the stable Phase 5 surface. Public product pages remain server-rendered, with only product actions and wishlist controls hydrated.

## UI/UX

New routes:

- `/cart`
- `/wishlist`

Both are responsive, have loading/error/empty states, and are marked `noindex`. The header shows a real quantity count from the cart API and links to wishlist. Product detail actions use the selected `variantId`, not reconstructed attributes.

## Testing and Verification

Passed:

- `npm run lint`
- `npx prisma validate`
- `npx prisma generate`
- `npm run typecheck --workspace @veyra/api`
- `npm run typecheck --workspace @veyra/web`
- `npm test` — 11 tests passed
- `npm run build`

The migration file is present and schema validation passes, but `npx prisma migrate deploy` remains blocked by invalid local PostgreSQL credentials (`P1000` against `localhost:5432`). No database migration was applied in this environment. Full DB-backed integration tests and manual authenticated/guest flows therefore remain pending environmental setup.

## Performance

Cart responses return product, variant, image, attribute, and inventory display data in one query. The cart page reconciles mutation responses without full-page refreshes. No inventory reservation or checkout work is performed by cart mutations.

## SEO

Cart and wishlist pages emit `noindex, nofollow` metadata and are not part of public catalogue routes. They must not be included in a future public sitemap.

## Phase 6 Readiness

Phase 6 can call `validateCart(cartId)` or `GET /api/v1/cart/validation` to receive authoritative current availability, quantity, price-change flags, subtotal, and readiness state. Checkout must revalidate prices and stock in its own transaction and create reservations only at the appropriate checkout/order boundary.

## Known Limitations

- Database migration cannot be applied until the local Postgres credentials are corrected.
- No browser E2E runner is configured in the repository.
- Guest merge currently occurs on the first authenticated cart request rather than inside the login response transaction.
- Public demo product data is still separate from the live catalogue API.
- Wishlist controls on catalogue cards require an authenticated API response to show saved state.

## Business Decisions Required

- `UNKNOWN — REQUIRES BUSINESS DECISION`: whether to use a dedicated stricter rate limit for cart and wishlist mutations.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: guest cart retention duration beyond the current 30-day technical default.
- `UNKNOWN — REQUIRES BUSINESS DECISION`: whether unavailable guest items should be displayed in the authenticated cart as flagged historical items instead of being omitted during merge.

## Architectural Invariants

- `Product -> ProductVariant -> Inventory`
- `Cart -> CartItem -> ProductVariant`
- `Wishlist -> WishlistItem -> Product`
- Cart does not reserve inventory.
- Frontend price and stock are never authoritative.
- Cart is not an order.
- Duplicate cart variants and wishlist products are prohibited per owner.

## Stop Condition

PHASE 5 COMPLETE

Implemented:

- Shopping Cart
- Guest Cart
- Authenticated Cart
- Guest to User Cart Merge
- Cart Validation
- Cart UI
- Wishlist
- Wishlist UI
- Storefront Integration
- Security
- Tests and documentation foundation

Checkout, Orders, Payments, M-Pesa and Delivery have NOT been implemented.

Implementation is intentionally stopped pending Phase 6.
