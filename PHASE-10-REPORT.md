# PHASE 10 REPORT — CUSTOMER ACCOUNT + POST-PURCHASE EXPERIENCE

## 1. Executive Summary

Phase 10 implements the customer account and post-purchase aggregation layer over the Phase 0–9 domains. Authenticated customers get a dashboard, profile management, address book, paginated order history, order detail with immutable snapshots, real fulfillment/delivery tracking, safe payment history, return/exchange/refund visibility, wishlist integration, cart-based reorder, password + session management, notification preferences, secure guest-order claiming, and safe deactivation/deletion workflows.

A substantial Phase 10 skeleton already existed in the working tree (account service, routes, most pages, migration). This phase reconciled it with the repository truth, fixed blocking defects (the API workspace did not typecheck), completed missing surfaces (`/account/wishlist`, `/account/returns/[returnId]`, reorder and claim UI), hardened session handling, and verified typecheck, lint, tests, and production build.

## 2. Scope

Included:

- Account dashboard aggregation (`GET /api/v1/account`)
- Profile view/update with explicit DTOs and audit logging
- Address book CRUD + default handling with ownership enforcement
- Order history with pagination, status filter, order-number search
- Order detail from immutable `OrderItem` snapshots
- Tracking from `Delivery` + `DeliveryStatusHistory` (+ order/payment context)
- Payment history with safe provider references only
- Return history + return detail (items, exchange, refund, history)
- Refund history (separate from returns; no amount inference)
- Wishlist summary endpoint + account wishlist page (Phase 5 backend reused)
- Reorder that only prepares the cart (never creates orders/reservations/payments)
- Password change (current session preserved, other sessions revoked)
- Session list with current-session indicator + revocation (current session protected)
- Preferences (`UserPreference`) get/patch
- Guest-order claiming via Phase 6 confirmation token (`hashToken`-verified)
- Deactivation (`INACTIVE`) and deletion-request (`DELETED` + `deletedAt`) preserving transactional records
- `noindex, nofollow` on all account routes via the account layout
- Responsive mobile navigation + card-based mobile layouts, loading/empty/error states
- Unit tests for profile validation and timeline building

Excluded (per phase brief): auth/RBAC rebuild, catalogue, cart/wishlist backend changes, checkout/order creation, M-Pesa provider work, fulfillment/delivery engines, returns/exchanges/refunds engines, admin platform, notifications platform (Phase 11), loyalty/marketplace/subscriptions.

## 3. Repository Assessment

What existed before this Phase 10 pass:

- `PHASE-0/1/3/4/5/6/7/8/9-REPORT.md` present. `PHASE-2-REPORT.md` is absent from the repository (authentication history must be read from code: `apps/api/src/lib/auth.ts`, `middleware/auth.ts`, `routes/auth.ts`).
- Prisma schema already contained Phase 10 additions: `UserPreference`, account `AuditAction` values, `Order(userId, createdAt)` and `Address(userId)` indexes; migration `20260917_phase10_customer_account` present.
- `apps/api/src/lib/account/account.ts` + `routes/account.ts` existed but the API workspace **failed typecheck** (10 errors: enum casts, missing `ReturnStatus` import, wrong groupBy mapping, wrong serializer name, invalid audit JSON typing, invalid `updateMany` data, broken reorder, dead `getCurrentSessionId` stub).
- Web account pages existed except `/account/wishlist` and `/account/returns/[returnId]` (both linked from nav/returns list, i.e. dead links). All client pages illegally exported `metadata`; `payments` page used `Link` without importing it; `[orderNumber]` page imported the API client at the wrong relative depth; duplicate `getReturns` export in `shopping-api.ts`; typed-routes `Link` errors; missing `DOM` lib in web tsconfig (all DOM globals untyped).
- No account unit tests existed (suite: 18 tests).

## 4. Account Architecture

`apps/api/src/lib/account/account.ts` is the query/aggregation layer; `apps/api/src/routes/account.ts` is the thin transport layer. The account layer owns no business state: it reads `User`, `Address`, `Order` (+`OrderItem` snapshots, `OrderStatusHistory`), `Payment`, `Delivery` (+`DeliveryStatusHistory`), `ReturnRequest` (+`ReturnItem`, history), `Exchange`, `Refund`, `Wishlist`, `Session`, `UserPreference`, and delegates cart writes to Phase 5 `addCartItem`. All identity comes from `requireAuth` (`request.user` / `request.session`); no `userId` is ever trusted from query/body/path.

## 5. Customer Routes

- `/account` (dashboard)
- `/account/profile`
- `/account/addresses`
- `/account/orders`
- `/account/orders/[orderNumber]`
- `/account/orders/[orderNumber]/tracking`
- `/account/wishlist` (new this pass)
- `/account/returns`
- `/account/returns/[returnId]` (new this pass)
- `/account/refunds`
- `/account/payments`
- `/account/security` (password, sessions, deactivation/deletion)
- `/account/preferences`

Shared shell: `app/account/layout.tsx` (nav + `robots: noindex, nofollow`). Reused storefront surfaces: `/wishlist`, `/cart`, `/returns` (request flow), `/order-confirmation/[orderNumber]`.

## 6. API Endpoints

Base `/api/v1`, all `requireAuth`:

```text
GET    /account
GET    /account/profile
PATCH  /account/profile
GET    /account/addresses
POST   /account/addresses
PATCH  /account/addresses/:id
DELETE /account/addresses/:id
POST   /account/addresses/:id/default
GET    /account/orders (?page,pageSize,status,search)
POST   /account/orders/claim
GET    /account/orders/:orderNumber
GET    /account/orders/:orderNumber/tracking
POST   /account/orders/:orderNumber/reorder
GET    /account/payments
GET    /account/returns
GET    /account/returns/:returnId
GET    /account/refunds
GET    /account/wishlist
GET    /account/security
POST   /account/security/password
DELETE /account/sessions/others
DELETE /account/sessions/:id
GET    /account/preferences
PATCH  /account/preferences
POST   /account/deactivate
POST   /account/delete
```

Fixes this pass: static routes (`/orders/claim`, `/sessions/others`) registered before param routes; imports hoisted; deactivate/delete moved into audited transactional service functions; status filter validated against the `OrderStatus` enum; claim payload length-limited.

## 7. Aggregation Model

- Dashboard issues bounded parallel queries (counts, groupBy, 5 recent orders with item ids, newest active order with full include, 4 wishlist items, active-return count + latest with full detail, latest refund) and maps everything to safe DTOs (`Number()` for Decimals, primary-image fallback, availability computed from live variant/inventory state).
- Order list uses one `findMany` with narrow selects + one `count` (no N+1).
- Detail/tracking load one order with `items/payments/deliveries(+history,method,zone)` and project explicitly.
- `buildOrderTimeline` merges `statusHistory`, `payments`, `delivery.history` chronologically; empty domains yield no events (never fabricated).

## 8. Profile

`GET/PATCH /account/profile` expose id, email (read-only in UI), names, phone, avatar, status, verification/login timestamps. `validateProfileInput` (unit-tested) enforces 1–120 char names and a conservative international phone pattern; unknown fields cannot pass (Zod schema + explicit patch object — no mass assignment). Email change is intentionally not offered: no verification flow exists (`UNKNOWN — REQUIRES BUSINESS DECISION`, §24). Updates write a `PROFILE_UPDATED` audit row.

## 9. Addresses

CRUD + single-default semantics (transactional unset/set) on the existing `Address` model. Every operation re-queries with `{ id, userId }` (IDOR/BOLA-safe; cross-user access returns 404). Zod length limits; `ADDRESS_CREATED/UPDATED/DELETED` audit rows. Schema note: `Address` has no phone field, so phone-per-address is unsupported; county/town map to `state`/`city` (documented limitation, not re-modeled).

## 10. Orders

History: page/pageSize (cap 50), validated status filter (`PENDING/CONFIRMED/PROCESSING/COMPLETED/CANCELLED`), case-insensitive order-number search scoped to `userId`, accessible pagination, mobile card layout, loading/empty/error states, plus a guest-order claim form (order number + confirmation token). Detail: authoritative snapshot totals/items (never recalculated), delivery + payment blocks, delivery-history timeline, actions (Track, Reorder, Request Return, Print). Ownership is `findFirst({ orderNumber, userId })`; order numbers are not credentials.

## 11. Payments

`GET /account/payments` returns id, order number, provider, status, amount, currency, safe provider reference, paid/created timestamps. No raw callback payloads, secrets, or internal ids. Multi-attempt orders surface each `Payment` record with its own status; the UI never derives success from STK acceptance — it renders backend `Payment.status`.

## 12. Returns

`GET /account/returns` + `GET /account/returns/:returnId` (by id or return number, owner-scoped) project return number, order number, type, status, reason/note, items with snapshot names + condition/disposition/refundAmount, linked refund + exchange summaries, and full status history. Eligibility/approval remain Phase 9's authority; the account UI only links to the `/returns` request flow.

## 13. Exchanges

Exchange state is displayed, never mutated, from the authoritative `Exchange` record: status, replacement variant id, quantity, plus price-difference handling left to Phase 9 policy. No historical `OrderItem` is rewritten.

## 14. Refunds

`GET /account/refunds` projects refund number, order number, amount, currency, status (`REQUESTED/PENDING/PROCESSING/SUCCEEDED/FAILED/CANCELLED` per schema), provider, safe provider reference, reason, requested/processed timestamps. Return completion never implies refund success — the two are rendered from separate records. No client-supplied amounts are accepted anywhere.

## 15. Wishlist

New `GET /account/wishlist` summary endpoint + new `/account/wishlist` page reusing the Phase 5 product-level wishlist (no duplicated logic). Dashboard shows count + up to 4 recent items with live availability. Full add/remove stays on the existing `/wishlist` surface.

## 16. Reorder

`POST /account/orders/:orderNumber/reorder` resolves the owner's order, ensures/creates the user cart, then per item revalidates product active/not-deleted, variant active, and current available stock before calling Phase 5 `addCartItem(cartId, variantId, quantity)` — so current prices apply and normal checkout validation still governs. Per-item results report `added` with `currentPrice/currentStock` or a reason (`no longer available` / `variant unavailable` / `out of stock` / `only N available`). Never creates orders, reservations, or payments. UI: order-detail "Reorder These Items" → cart on success.

## 17. Security

- Authentication: existing `veyra_session` cookie + `requireAuth`; 401s surface a re-login path; no userId from client input.
- Authorization: owner-scoped queries everywhere; cross-user order/address/return/refund/session access returns 404/403 (IDOR/BOLA by construction, not UI hiding).
- Sessions: list returns safe metadata only (device/user-agent, ip, created/last-used/expiry/revoked, `isCurrent` from `request.session.id`); revoking the current session is rejected (use sign-out); `revokeOtherSessions` requires a determinable current session; password change preserves the current session and revokes all others transactionally.
- Data minimization: explicit DTOs; no hashes, tokens, roles/permissions, cost/supplier data, raw provider payloads, staff notes, or audit logs in responses.
- Audit: `PROFILE_UPDATED, PASSWORD_CHANGED, ADDRESS_CREATED/UPDATED/DELETED, SESSION_REVOKED, SESSIONS_REVOKED, ACCOUNT_DEACTIVATED, ACCOUNT_DELETION_REQUESTED, PREFERENCES_UPDATED, GUEST_ORDER_CLAIMED`.
- Rate limiting: existing global Fastify limit; no duplicate middleware (per-operation limits: see §24).

## 18. Account Lifecycle

- Profile update: authenticated, validated, audited.
- Guest conversion: `POST /account/orders/claim` requires the Phase 6 confirmation token verified with the same `hashToken` construction as checkout; already-claimed or token-less orders return 404/403 (order number alone can never claim). Claiming nulls the token hash and audits `GUEST_ORDER_CLAIMED`.
- Guest cart merge: unchanged Phase 5 behavior (merge on first authenticated cart request).
- Deactivation sets `INACTIVE` + revokes sessions (audited). Deletion-request sets `DELETED` + `deletedAt` + revokes sessions (audited). Orders, payments, refunds, and audit rows are preserved; no hard deletes; no invented retention/anonymization policy.

## 19. Preferences

`UserPreference` (emailOrderUpdates/emailDelivery/emailReturns/emailMarketing) with get-or-create read and explicit-field patch, audited via `PREFERENCES_UPDATED`. Minimal abstraction only — no sending infrastructure built (Phase 11 owns notifications). Marketing default `false`.

## 20. Database Changes

No new migration this pass. Pre-existing `20260917_phase10_customer_account` (additive only): account `AuditAction` enum values, `UserPreference` table + index, `Order(userId, createdAt)` and `Address(userId)` indexes. No redundant indexes added; order/return/refund/payment lookups reuse Phase 0–9 indexes. `npx prisma generate/validate` are non-functional in this environment (Prisma 8 RC CLI registers no commands); schema soundness is evidenced by `tsc` against the generated client (which includes `UserPreference`), the suite, and the production build.

## 21. Testing

- `npm test`: **8 files / 25 tests pass** (was 18). New `apps/api/src/lib/account/account.test.ts` (7 tests): profile validation (accept/normalize/reject/empty-patch) and timeline merging/ordering/empty-domains.
- DB-backed API/IDOR tests (cross-user order/address/return/refund/session, pagination, tracking states, reorder edge cases, session revocation round-trip, deletion) could not run: no reachable PostgreSQL in this environment (historical `P1000` on `localhost:5432`, consistent with Phases 1–9). Ownership is enforced in code paths reviewed above; DB-backed verification must run where migrations can apply.
- Accessibility/responsive: semantic landmarks, labelled inputs, `role=alert/status` messages, keyboard-operable nav/filters/pagination, text+color status badges, card layouts at mobile widths; verified by construction, not automated runners (none configured).

## 22. Performance

Dashboard uses ~8 bounded parallel queries; order list is select-narrow + paginated (cap 50); detail/tracking are single-order fetches with controlled includes. No N+1 patterns. Account routes send no public cache headers beyond existing defaults and must be served `private/no-store` at the edge (no edge config exists in-repo). Build: account routes add ~3–5 kB each; shared first-load JS 87.1 kB.

## 23. Privacy/SEO

`app/account/layout.tsx` sets `robots: { index: false, follow: false }` for the whole `/account` tree (client pages no longer export ineffective `metadata`). No sitemap/robots files exist in-repo, so no account URLs can leak via sitemap. No account PII in logs (structured logger; error handler strips 5xx details).

## 24. Business Decisions

```text
UNKNOWN — REQUIRES BUSINESS DECISION: email/phone change verification flow (email currently immutable in UI).
UNKNOWN — REQUIRES BUSINESS DECISION: account-deletion retention/anonymization rules and reactivation policy.
UNKNOWN — REQUIRES BUSINESS DECISION: guest return authorization (Phase 9 V1: unsupported).
UNKNOWN — REQUIRES BUSINESS DECISION: per-operation rate limits (password change, deletion, session revocation, claim).
UNKNOWN — REQUIRES BUSINESS DECISION: return window default, sale-item/Category returnability, return shipping payer.
UNKNOWN — REQUIRES BUSINESS DECISION: exchange price-difference/fulfillment policy.
UNKNOWN — REQUIRES BUSINESS DECISION: refund display/retention policy for provider references.
UNKNOWN — REQUIRES BUSINESS DECISION: session retention/last-activity update policy.
UNKNOWN — REQUIRES BUSINESS DECISION: address phone + structured county/town model (schema has neither).
UNKNOWN — REQUIRES BUSINESS DECISION: marketing-consent legal basis/copy.
```

## 25. Known Limitations

- `PHASE-2-REPORT.md` missing; auth behavior reconstructed from code.
- No live-DB verification (migration unapplied; see §20–21).
- Prisma 8 RC CLI non-functional here (`generate`/`validate`/`migrate` unreachable).
- `Address` lacks phone; county/town are free-text `state`/`city`.
- Dashboard recent-order `itemCount` now correct; wishlist count reflects saved rows (not purchasability).
- Session `lastUsedAt`/`ipAddress` depend on Phase 2 writers; displayed as stored.
- No E2E runner; no automated a11y/responsive suites.

## 26. Files Changed

API:

- `apps/api/src/lib/account/account.ts` (rewrite: typed DTOs, fixed queries, reorder via cart service, session-aware security, transactional lifecycle, timeline, return detail, wishlist summary)
- `apps/api/src/routes/account.ts` (route ordering, validation, session plumbing, audited lifecycle delegation)
- `apps/api/src/lib/account/account.test.ts` (new)

Web:

- `apps/web/tsconfig.json` (DOM lib)
- `apps/web/lib/shopping-api.ts` (`getAccountReturns` rename, `getAccountReturnDetail`, `getAccountWishlist`, `pickedUpAt` type)
- `apps/web/app/account/wishlist/page.tsx` (new)
- `apps/web/app/account/returns/[returnId]/page.tsx` (new)
- `apps/web/app/account/orders/[orderNumber]/page.tsx` (import depth, reorder UI, typing)
- `apps/web/app/account/orders/page.tsx` (claim-guest-order UI, typing cleanup)
- `apps/web/app/account/security/page.tsx` (API-client lifecycle actions)
- `apps/web/components/AccountNav.tsx`, `apps/web/app/account/page.tsx` (typed-routes)
- `payments/returns/refunds/tracking` pages (Link import, `ref` bug, duplicate-helper cleanup)
- All account client pages (removed invalid `metadata` exports; layout owns `noindex`)

## 27. Regression Verification

- `npm run typecheck` — pass (api + web; previously api failed).
- `npm run lint` — pass (warnings only: pre-existing `next/image` suggestions).
- `npm test` — 25/25 pass.
- `npm run build` — pass; all account routes render in route table.
- No Phase 0–9 domain logic touched (only additive account reads + cart-service reuse); existing suites unchanged and green. Live checkout→payment→fulfillment→return→refund traversal remains blocked on database availability, as in prior phases.

## 28. Phase Completion

```text
PHASE 10 COMPLETE

Customer Account + Post-Purchase Experience has been implemented and verified.

Implementation is intentionally stopped pending Phase 11.
```
