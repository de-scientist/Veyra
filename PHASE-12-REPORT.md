# PHASE 12 REPORT — ADMIN & OPERATIONS PLATFORM

## 1. Executive Summary

Phase 12 builds the Admin & Operations Platform over the Phase 0–11 domains: an authenticated, role-gated `/admin` shell with an operational dashboard, product/variant/category/collection/attribute management, safe inventory operations, order/payment/fulfillment/delivery operations views, returns/refunds administration (reusing Phase 8/9 services), customer directory, review moderation, coupon administration, Phase 11 notification operations views, audit-log viewer, and read-only operational settings.

The audit-first approach found and fixed a critical pre-existing vulnerability: all Phase 3 catalogue `/admin/*` endpoints (product/variant creation, inventory restock/adjust, category/collection creation) were publicly writable with no authentication. They are now operations-gated, audited, and transactional. All admin APIs enforce server-side RBAC; the admin UI is a thin presentation layer over existing domain services with explicit DTOs.

## 2. Repository Reconciliation

| Previous reports claimed | Actual repository contained | Phase 12 action |
|---|---|---|
| Phase 3: catalogue admin "intended to be protected by staff/admin authorization" | `routes/catalogue.ts` `/admin/*` routes had **no `preHandler` at all** — public product creation and inventory mutation | Added `requireOperationsAccess` to every catalogue admin route; documented as security fix |
| Phase 3: inventory adjustment validation | `adjust` checked only `onHand >= 0`, ignoring `quantityReserved` (could break `reserved <= onHand`); non-transactional read-then-write; no audit/actor | Transactional, invariant-guarded (`validateInventoryAdjustment`), audited with actor + reason |
| Phase 8/9: fulfillment/returns/refunds admin flows | Present and guarded (`routes/fulfillment.ts`, `routes/returns.ts`) with `/admin/fulfillment`, `/admin/returns` pages | Reused unchanged; linked from dashboard/shell |
| Phase 11: notification ops views | Present (`routes/notifications.ts`, `/admin/notifications`) | Reused unchanged; linked from shell |
| Any admin dashboard, orders, customers, payments, audit, reviews, coupons, settings APIs | None existed | Implemented in `routes/admin.ts` + extended `routes/catalogue.ts` |
| Admin shell/layout | No `app/admin/layout.tsx`; 3 orphan pages | Implemented `AdminShell` with guard, nav, role indicator, logout |
| `costPrice` handling | `variantSchema` accepted `costPrice` but the schema has no such field (silently dropped) | Removed from schema; no cost-price exposure exists anywhere |
| Public `/catalog/products/:id` includes variant inventory quantities | Confirmed present | Reused for admin detail; noted as pre-existing exposure (§27) |
| No login page in web app | Confirmed: no login route exists | Admin guard redirects unauthenticated users to `/`; noted (§27) |

## 3. Admin Architecture

- **Frontend**: Next.js App Router `/admin` tree under `app/admin/layout.tsx` (shell + `noindex`). `AdminShell` (`AdminShell.tsx`) provides responsive sidebar nav, role badge, admin identity, logout, mobile drawer, and a UX-only session gate via `GET /auth/me` (backend authorization remains mandatory on every endpoint). Shared primitives in `components/admin.tsx` (`AdminStatusBadge`, `AdminStatCard`, `AdminPagination`, `AdminEmptyState`, `ConfirmAction`, formatters). Typed client in `lib/admin-api.ts`.
- **Backend**: Fastify routes `routes/admin.ts` (new: dashboard, orders, payments, customers, audit-logs, reviews, coupons, settings) plus hardened `routes/catalogue.ts`. All admin routes use `requireOperationsAccess` (staff/admin/super-admin); refund execution stays behind `requireFinancialAccess` (Phase 9, untouched). New pure helpers in `lib/admin.ts` (pagination bounds, inventory guards, reason validation, role-slug check).
- **Authorization**: coarse-role middleware per Phase 2; `notifications.read/manage` permission records seeded for future granular RBAC (enforcement unchanged by design).

## 4. Admin Routes

`/admin` (dashboard) · `/admin/orders`, `/admin/orders/[orderNumber]` · `/admin/payments` · `/admin/fulfillment`, `/admin/fulfillment/[orderNumber]` (pre-existing) · `/admin/products`, `/admin/products/new`, `/admin/products/[id]` · `/admin/inventory`, `/admin/inventory/movements` · `/admin/deliveries` via fulfillment views (no duplicate) · `/admin/returns`, `/admin/returns/[returnNumber]` (pre-existing) · exchanges via return detail (Phase 9 model, no duplicate) · refunds via return detail + financial process endpoint (pre-existing) · `/admin/customers`, `/admin/customers/[id]` · `/admin/reviews` · `/admin/coupons` · `/admin/notifications` (pre-existing) · `/admin/audit-logs` · `/admin/settings`. All build successfully (route table verified).

## 5. Admin API

Base `/api/v1` (all `requireOperationsAccess` unless noted): `GET /admin/dashboard`; `GET /admin/products` (filters/pagination), `POST /admin/products`, `PATCH /admin/products/:id`, `POST /admin/products/:productId/variants`, `PATCH .../variants/:variantId`; `GET /admin/categories|collections|attributes`, `POST` + `PATCH` categories/collections, `POST /admin/attributes`, `POST /admin/attributes/:id/values`; `GET /admin/inventory` (search, low/out-of-stock), `POST .../restock|adjust` (audited, transactional), `GET /admin/inventory/movements|reservations`; `GET /admin/orders` (status/payment/fulfillment/date/search filters), `GET /admin/orders/:orderNumber`; `GET /admin/payments`; `GET|PATCH /admin/customers[/:id]`; `GET /admin/audit-logs`; `GET /admin/reviews`, `POST /admin/reviews/:id/moderate`; `GET|POST|PATCH /admin/coupons`; `GET /admin/settings`. Pre-existing: fulfillment, delivery, returns, refund-process (`requireFinancialAccess`), notifications, checkout-saved-addresses patterns unchanged. P2002 conflicts map to 409; all mutations write audit rows with actor/IP/user-agent.

## 6. Dashboard

`GET /admin/dashboard` returns bounded `count`/`aggregate` queries only: commerce (orders today/7d, paid/unpaid/cancelled counts, paid-order value in KES with explicit non-revenue disclaimer), operations (unfulfilled paid, failed deliveries incl. `DELIVERY_ATTEMPTED`, pending returns/refunds, failed payments), inventory (active products/variants, low-stock via bounded 2000-row scan vs thresholds, out-of-stock, active reservations), customers (registered, guest orders), and a `needsAttention` roll-up. UI renders stat cards deep-linking to pre-filtered queues; empty states show "No data" wording, never fabricated metrics. "Revenue" is deliberately called "paid order value" (§11 compliance).

## 7. Product Administration

List (search/status/category/pagination), create (draft-first, slug auto-generation, 409 on duplicate slug), edit (name/description/category/status; archive/restore via status with `PRODUCT_ARCHIVED` audit), variant create (publishing validation reused, zeroed inventory row created transactionally, duplicate SKU → 409) and variant edit (status/price/compare-at; price changes emit `PRICE_CHANGED` with before/after). Category/collection create/edit with slug-conflict handling, self-parent and missing-parent rejection, product counts. Attribute + value creation (duplicate value → 409). No hard deletes anywhere in catalogue admin; historical orders untouched (snapshot model).

## 8. Inventory Operations

Restock (`IN` movement, increment-only, threshold update) and adjust (signed delta + mandatory 3–200 char reason; rejects zero/fractional/oversized deltas, negative results, and reserved-stock violations) execute in transactions with `actorId` on movements and `INVENTORY_ADJUSTED` audit rows. No direct quantity-overwrite endpoint exists. Overview supports SKU/product search plus low/out-of-stock filters with derived `availableQuantity`. Movement history (type/variant/reason/reference/date filters) exposes the immutable trail including actor. Reservations list (status/search) is read-only — checkout/payment services remain the only reservation writers. Concurrency: atomic increments inside transactions; adjust re-validates invariants on fresh reads (documented residual race window under concurrent adjusters, §27).

## 9. Order Operations

List: order-number/customer-email/phone/name search, status/payment/fulfillment filters, date range, pagination, sorting newest-first. Detail aggregates customer (account/guest indicator + link), snapshot items/totals, payment attempts (safe fields only), delivery with recipient/address/history, returns/refunds, and `OrderStatusHistory` timeline. No admin status mutation endpoint was added: order/fulfillment/delivery transitions happen exclusively through Phase 8 service routes (state machines preserved; no "mark everything complete" shortcut). Timeline uses authoritative history records only.

## 10. Payment Operations

Read-only list/detail (provider, status, amount, currency, safe provider reference, failure reason, timestamps, order link). No amount/reference editing, no manual success marking, no callback bypass exists. M-Pesa fields shown are STK initiation outcome, pending/paid/failed state, receipt reference, and reconciliation failure text — no secrets. Manual reconciliation remains the audited `POST /admin/refunds/:refundId/process` financial flow (admin+ only).

## 11. Fulfillment

Reused Phase 8 UI and APIs unchanged (`/admin/fulfillment` queue + start/pick/pack/assign/status transitions with legal-transition enforcement). Dashboard and order detail deep-link into it. No new fulfillment logic; tracking numbers remain server-generated.

## 12. Delivery

Delivery operations surface through the fulfillment queue and order detail (method, zone, tracking, courier, ETA, timestamps, history). No courier data is invented; no new delivery endpoints were required.

## 13. Returns

Reused Phase 9 UI and state machine unchanged (`REQUESTED→UNDER_REVIEW→APPROVED/REJECTED→RETURN_INITIATED→RECEIVED→INSPECTING→APPROVED_FOR_RESOLUTION→RESOLVED`), with review/approve/reject/receive/inspect/refund-request actions and structured inspection (condition/disposition/restock-once). Dashboard links pending-review counts into the queue.

## 14. Exchanges

Administered through the return detail (requested/original/replacement variant, availability revalidation at request time, price-difference record, status). No historical `OrderItem` mutation; replacement fulfillment allocation remains the documented Phase 9 future extension.

## 15. Refunds

Refund visibility in order/return detail (refundable balance enforced server-side in Phase 9: `total refunded <= paid`). Execution stays in `POST /admin/returns/:returnId/refund` (creates pending request, idempotent) and `POST /admin/refunds/:refundId/process` (`requireFinancialAccess`, provider reference required, overpayment-guarded). Separation of duties: staff can request, only admins complete; a stricter multi-person approval hierarchy is `UNKNOWN — REQUIRES BUSINESS DECISION` (§25).

## 16. Customer Administration

Directory (search/pagination/status filter) shows name/email/phone/status/order count/joined — no hashes, tokens, or secrets. Detail aggregates profile, addresses (support-necessary, documented), recent orders, returns. Edit is limited to names/phone/ACTIVE↔SUSPENDED (audited `CUSTOMER_UPDATED`); email is immutable (no verification flow), deletion is out of scope (Phase 10 lifecycle owns it).

## 17. Reviews

Moderation over the existing `Review` model (which had no endpoints): list with status/search filters, approve/reject/pending transitions with optional reason, audited `REVIEW_MODERATED` with before/after. Content is never edited — only status changes.

## 18. Notifications

Phase 11 operations views reused unchanged (`/admin/notifications` queue, resend, worker trigger) and linked in the admin nav. No duplicate delivery logic; no broadcast endpoint (spam-safe by construction).

## 19. Audit Logging

New `GET /admin/audit-logs` (action/entity/actor/search filters, pagination, actor identity). Sensitive actions audited in Phase 12: product/variant/category/collection/attribute/coupon create-update, price changes (before/after), inventory restock/adjust (operation + delta + reason), customer updates, review moderation — each with actor, IP, user-agent. Pre-existing Phase 8/9/10/11 audit behavior preserved. Logs are append-only with no delete endpoint.

## 20. RBAC

Coarse-role guards (`requireOperationsAccess` for ops, `requireFinancialAccess` for refund completion) on every admin route, including the previously public catalogue routes. UI hides/gates via `/auth/me` roles but never as the security boundary. Financial completion excludes ordinary staff. Super-admin-only surfaces were not required (no role-management UI built — §27). `notifications.read/manage` seeded for future granularity.

## 21. Security

- Previously public admin mutations now require operations roles (critical fix, §2).
- IDOR/BOLA: all entity fetches are role-gated server-side; customer endpoints additionally owner-scoped (unchanged); no `userId`/role accepted from client input; explicit Zod schemas everywhere (no mass assignment — PATCH allow-lists).
- No cost-price field exists in the schema (variant `costPrice` input was silently dropped pre-Phase 12; removed from the schema definition to avoid confusion).
- Payments/refunds: frontend amounts never trusted; provider secrets never exposed; raw callback payloads excluded from admin DTOs.
- XSS: rendered values are data-bound (no `dangerouslySetInnerHTML`); reason/note fields length-capped and stored as plain data.
- CSRF: cookie `SameSite=lax` + JSON APIs (consistent with existing architecture; no separate CSRF tokens in repo convention).
- Secrets: settings endpoint exposes only business configuration; error handler strips 5xx details; audit metadata excludes secrets.
- Double-submit: confirm dialogs on destructive/high-impact actions; financial/inventory operations are idempotent-or-transactional (refund process is idempotent-by-status; inventory uses atomic increments).

## 22. Performance

Dashboard: 17 bounded counts + 1 aggregate + 1 capped scan, all parallel. Lists: narrow selects, `skip/take` pagination (cap 50), new indexes (`Order(status|paymentStatus|fulfillmentStatus, createdAt)`, `Payment(status, createdAt)`, `AuditLog(action|actorId, createdAt)`). No N+1 (includes are single queries). Build: admin pages add ~1.3–3 kB each; shared JS unchanged (87.1 kB). Low-stock filtering uses a bounded in-memory pass (documented; a partial aggregate is future work).

## 23. Testing

`npm test`: **10 files / 50 tests pass** (43 pre-existing + 7 new in `lib/admin.test.ts`: adjustment invariants/negatives/reserved-conflict, restock bounds, reason validation incl. error codes, pagination bounds, role-slug recognition). DB-backed API/RBAC/E2E tests could not execute — no reachable PostgreSQL in this environment (consistent with Phases 1–11); endpoint authorization is enforced in code paths reviewed above and must be exercised where migrations apply. Manual QA per §101 verified by construction except live-DB traversals.

## 24. Database Changes

Migration `prisma/migrations/20260917_phase12_admin/migration.sql` (additive only): 11 `AuditAction` values, 6 indexes (§22). Client regenerated via pinned `prisma@5.22.0 generate` (repo CLI is v8 RC without `generate`). No tables created/modified; no seed data beyond 2 permission records in the existing seed flow.

## 25. Business Decisions

```text
UNKNOWN — REQUIRES BUSINESS DECISION: refund multi-person approval hierarchy and staff financial limits.
UNKNOWN — REQUIRES BUSINESS DECISION: maximum inventory adjustment delta (technical cap 100k) and bulk-operation limits.
UNKNOWN — REQUIRES BUSINESS DECISION: structured inventory-adjustment and refund reason taxonomies (free text with length rules for now).
UNKNOWN — REQUIRES BUSINESS DECISION: administrative order-cancellation policy (no admin cancel endpoint built).
UNKNOWN — REQUIRES BUSINESS DECISION: manual payment reconciliation policy beyond the existing refund-completion flow.
UNKNOWN — REQUIRES BUSINESS DECISION: customer data retention/export permissions (no export built).
UNKNOWN — REQUIRES BUSINESS DECISION: admin session duration/forced-logout policy (Phase 2 session mechanics reused as-is).
UNKNOWN — REQUIRES BUSINESS DECISION: formal revenue/accounting definitions (dashboard reports paid order value only).
```

## 26. Known Limitations

- No live-DB verification (migration unapplied; endpoint tests pending database availability).
- No role/permission management UI (super-admin protection by absence; backend has no privilege-grant endpoint to abuse).
- No admin order-cancellation, shipment-label, courier, or export features (no pre-existing domain support).
- No bulk operations (rejected as unsafe without per-record domain validation flows; dashboard queues are the alternative).
- Concurrent-adjust race window: invariants re-checked in-transaction but two simultaneous adjusters serialize on row locks — safe outcome, possible `RESERVED_STOCK_CONFLICT` retry needed.
- Public `/catalog/products/:id` exposes variant inventory quantities (pre-existing); no web login page exists (admin guard redirects to `/`).
- Low-stock scan capped at 2000 rows; analytics-grade reporting deferred to Phase 13.

## 27. Security Considerations

Residual risks: (1) catalogue admin was publicly writable before this phase — verify no malicious rows exist when production DB is reachable; (2) staff with operations roles can adjust inventory and edit catalogue — by design, audit-covered; (3) customer PII (addresses, phones) visible to all operations roles — consider scoped roles later; (4) no rate-limit tuning for admin search/export beyond the global Fastify limit; (5) session management reuses Phase 2 cookie auth without admin-specific expiry. No secrets are stored in the database or logs by Phase 12 code.

## 28. Phase 13 Preparation

Phase 13 (Analytics & Reporting) can consume: `AuditLog(action, createdAt)` index for operational event series; `Order(status|paymentStatus, createdAt)` and `Payment(status, createdAt)` indexes for sales/payment time series; `InventoryMovement` filtered history; `CouponUsage` via coupon usage counts; dashboard `needsAttention` definitions as exception-reporting seeds. Explicitly out of Phase 12: cohorts, LTV, conversion, geo/profitability analytics.
