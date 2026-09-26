# Phase B — Checkout, Cart & Commerce Functional Fixes Report

Status: IMPLEMENTED. Builds on Phase A (runtime stabilization). No UI redesign, no M-Pesa, no new cart/checkout architecture, no hard-coded pricing/zones, no fake data.

## Executive Summary

The audit found the backend commerce core (cart, checkout, inventory reservation, order creation) already correct and transaction-safe; the verified defects were all at the seams:

1. **Cart refresh/count never synced** — `Header` loaded the cart count once on mount; add/remove/quantity/checkout/login never refreshed it. Fixed with a `jb:cart-updated` event on the exact established `jb:session-updated` pattern (no new store/library); backend stays authoritative, listeners re-fetch.
2. **Serializable-isolation loser returned 500** — two buyers racing the last unit produced Postgres `40001` → unhandled P2010 → 500. Now a controlled, retryable 409 `CHECKOUT_CONFLICT` (proven by the new concurrency test).
3. **Deadlock/write-conflict returned 500** — P2034 under parallel load likewise mapped to 409 `CHECKOUT_CONFLICT`.
4. **Stale-reservation sweep was dead code** — tested helper with no production caller. Wired as `POST /admin/inventory/reservations/release-stale` (operations access, audited as `INVENTORY_ADJUSTED` since the closed `AuditAction` enum has no sweep member).
5. Everything else (guest/user carts + merge, upsert-no-duplicates, price snapshots + confirmation gate, authoritative totals, idempotency, snapshots, status history, UNPAID discipline) verified working and locked in with 16 new integration tests.

## Cart Architecture

- **Source of truth:** PostgreSQL via Fastify; frontend holds only a re-fetched cache. Mutations (`POST/PATCH/DELETE /cart/items`, `DELETE /cart`) return the authoritative serialized cart (`reloadCart` avoids the orphan-guest-cart pitfall); `CartPageClient` sets state directly from those responses.
- **Guest cart:** `veyra_guest_cart` HttpOnly cookie (`GUEST_CART_COOKIE`), 30-day retention/expiry, `sessionId`-keyed cart. Survives navigation/refresh; expired/non-ACTIVE carts are reactivated with a renewed expiry.
- **Authenticated cart:** `userId`-keyed cart, reactivated if non-ACTIVE.
- **Merge:** on any `getOrCreateCart` with both session + guest cookie, guest lines upsert into the user cart capped at `min(requested, 20, available)`; duplicates merge quantities; guest cart → `MERGED` + cookie cleared. Verified by test (no duplicate rows, retired guest cart).
- **Cache synchronization (fixed):** `CART_UPDATED_EVENT = 'jb:cart-updated'` + `notifyCartUpdated()` in `shopping-api.ts`. Dispatched after add (`ProductActions`), update/remove/clear (`CartPageClient`), and successful order placement (`CheckoutPageClient`). `Header` re-fetches the count on the event and on session-status change (login/logout merge). No `window.location.reload`, no second store.

## Checkout Architecture

- **Init:** parallel `getCart()` + `getCheckoutOptions()` with loading/empty/error states; methods/zones empty states added in Phase A.
- **Validation (backend, `checkoutSchema` + `lib/checkout.ts`):** customer name/email/phone (incl. KE normalization), cart ownership/existence/non-empty, per-item purchasability/quantity/price-freshness/stock, address, zone (`ACTIVE` + country match), method, rate covering subtotal. Stale/archived/insufficient items → 409 with item-level detail; nothing trusted from the client (no totals/prices submitted).
- **Address:** saved `addressId` verified to belong to the requesting user (403 otherwise); guest supplies address inline; order stores a `shippingAddressSnapshot` so later profile edits never rewrite history.
- **Delivery/shipping:** `GET /checkout/options` exposes only ACTIVE methods/zones backed by ACTIVE rates; `resolveShipping` revalidates the selection server-side (unknown zone → 409, missing → 400); one authoritative rate lookup (`minOrderValue <= subtotal`, highest qualifying).
- **Totals:** backend-only (`subtotal/discountTotal/shippingTotal/taxTotal/grandTotal`); preview is display-only; `place` re-derives everything inside the transaction.
- **Order creation:** single `Serializable` transaction (validate → conditional reserve → order + items + delivery + status history + cart `CHECKED_OUT` + idempotency link). Snapshots per item (name/SKU/variant description/unit price/discount/subtotal/total). Order numbers `ORD-YYYYMMDD-HEX` (unique, backend-generated). Status `PENDING`, payment `UNPAID`, fulfillment per delivery `PENDING` — never marked paid by checkout. Status history written once per creation; idempotency replay returns the same order with `replayed: true` (no duplicate history — replay path creates nothing).
- **Double-submit:** UX `busy` disables buttons; authoritative protection is the `Idempotency-Key` contract (16–200 chars, scope-bound, hash-checked; mismatched reuse → 409).
- **Failure recovery:** all failures leave cart intact and reserve nothing (verified); serialization/deadlock losers get retryable 409 `CHECKOUT_CONFLICT`; frontend preserves form state and shows controlled inline errors.

## Inventory

- Model: `quantityOnHand` / `quantityReserved`, `available = onHand − reserved` (`calculateAvailableQuantity`). Cart never reserves.
- Reservation: conditional `UPDATE … WHERE available >= qty RETURNING` inside the order transaction — oversell-impossible at the SQL level; losers get 409 (`CHECKOUT_STOCK_UNAVAILABLE`) or `CHECKOUT_CONFLICT`.
- Lifecycle: `ACTIVE` (placement) → `CONVERTED` (payment service, untouched this phase) → `RELEASED` via `releaseStaleReservations` (PENDING+UNPAID orders older than 60 min; idempotent; per-row guarded; skips contested rows with a logged retry). Now triggerable via the new admin sweep endpoint (audited).
- Concurrency proof: stock=1 race test → exactly one 200 + one 409, reserved total 1, `onHand − reserved ≥ 0`.

## API Contracts

| Endpoint | Auth | Request / Validation | Response / Errors |
| -------- | ---- | -------------------- | ----------------- |
| `GET /cart` | guest/user | cookies | `{ success, data: Cart }` (items with `availability`, `priceChanged`, `availableQuantity`) |
| `POST /cart/items` | guest/user | `{ variantId: uuid, quantity: int 1.. }` | authoritative `Cart`; 409 `VARIANT_UNAVAILABLE`/`INSUFFICIENT_STOCK`/`CART_CONFLICT`, 400 `INVALID_QUANTITY` |
| `PATCH /cart/items/:itemId` | guest/user (scoped `cartId`) | `{ quantity: int 1.. }` | authoritative `Cart`; 404 item, 409 stale/insufficient |
| `DELETE /cart/items/:itemId`, `DELETE /cart` | guest/user (scoped) | — | authoritative `Cart` (possibly empty) |
| `GET /cart/validation` | guest/user | — | `{ readyForCheckout, invalidItems }` |
| `GET /checkout/options` | open | — | `{ methods[], zones[] }` (ACTIVE-only, rate-backed) |
| `POST /checkout/preview` | guest/user | `checkoutSchema` | authoritative preview + `priceChangedItems`, `requiresPriceConfirmation` (never blocks) |
| `POST /checkout` | guest/user | `checkoutSchema` + `Idempotency-Key` | `{ order, confirmationToken?, replayed, nextAction: PAYMENT_PENDING }`; 400 validation, 409 `CHECKOUT_*` conflicts, 404 cart |
| `POST /admin/inventory/reservations/release-stale` (new) | operations | — | `{ released }`; 401/403 fenced; audited |
| `GET /orders/:orderNumber` | owner by session/token | token query/header for guests | order snapshot; strangers → 404 |

## Defect Matrix

| Issue | Root Cause | Fix | Verification |
| ----- | ---------- | --- | ------------ |
| Cart count stale after add/remove/quantity/checkout/login | `Header` fetched count once on mount; no invalidation mechanism | `jb:cart-updated` event + listeners (established session-event pattern); refresh on session change | code trace of all 5 mutation sites + header; `cart-events.test.ts` (3) |
| Last-stock race returned 500 | PG `40001` → unhandled P2010 | Mapped to 409 `CHECKOUT_CONFLICT` in `placeOrder` catch | concurrency test asserts `[200, 409]`, reserved = 1, never negative |
| Parallel-load deadlock returned 500 | P2034 unhandled in `placeOrder` | Mapped to 409 `CHECKOUT_CONFLICT` | full-suite green (270/270) incl. parallel write load |
| Stale-reservation sweep unreachable | Helper existed + tested, zero callers | New audited admin endpoint; `INVENTORY_ADJUSTED` action (closed enum, no schema change) | endpoint test: 401 anonymous, 200 + `RELEASED` for staff |
| Delivery-zone 400 (from Phase A list) | `''` zone code slipped through optional-string schema | Phase A `buildCheckoutInput` + `.min(1)`; this phase's invalid-zone tests lock it | matrix tests: unknown → 409, missing → 400, bad uuid → 400 |

## Test Results

New: `apps/api/src/routes/commerce.test.ts` (16 integration tests, real API+DB, self-cleaning) covering the §41 matrix — add/merge/over-stock/archived/update/remove/empty/guest-persist/login-merge/price-change/empty-cart/invalid-zone-method-address/failure-intactness/snapshots+delivery+history+UNPAID/idempotent-replay/unique-numbers/last-stock-race/sweep-authz — plus `apps/web/lib/cart-events.test.ts` (3). Full `npm test`: **39 files, 270/270 PASS**. (A transient 409-loss under parallel-suite load in one test is handled via the documented retry-with-fresh-key contract; the bcrypt 5 s timeout flake from Phase A did not recur.)

Commands: `npm run typecheck` PASS · `npm run lint` PASS (0 errors; pre-existing warnings only) · `npm test` 270/270 PASS · `npm run build` PASS (59/59 routes; prerender `ECONNREFUSED` noise is pre-existing — build-time pages calling the non-running API).

## Remaining Issues

- **Browser verification NOT VERIFIED** — no browser harness in this environment (add-to-cart → count, cart edit → totals, checkout → confirmation, and one failure case should be clicked through against a running stack).
- **Verified gaps (by design, not implemented):** no coupon application inside checkout (`discountTotal` always 0 — coupon admin exists; wiring it in is a business-rule decision for a later phase); no background worker for the stale sweep (explicit admin trigger only); payment stays `UNPAID` until the dedicated payment phase.
- Pre-existing notes carried over: `<img>`/`next/image` lint warnings, unused-var warning in `routes/storefront.ts`, no `next build`-while-`dev` (corrupts `.next`).
