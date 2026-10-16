# JB Mercantile — Admin Route Permission Audit (Phase 2)

Date: 2026-10-17. Source of truth: repository source code (`apps/api/src/routes/*`,
`apps/api/src/lib/*`, `apps/api/src/middleware/auth.ts`, `prisma/seed.ts`).
No production database was connected. No live database contents were inspected.
Database state (local/dev/test): UNVERIFIED except where a prior seed/test run
established it (see `docs/ADMIN-STAFF-RBAC-CONFIGURATION-REPORT.md` §6).

Prior phase enforced DB permissions on 21 endpoints (inventory ×7, orders ×3,
fulfillment/delivery ×10, refund completion ×1) via AND-composition:
`[roleGate, requirePermission(...)]`. This audit covers every remaining
role-gated admin endpoint. Guard legend: Ops = `requireOperationsAccess`
(staff/admin/super_admin slugs), Fin = `requireFinancialAccess`
(admin/super_admin slugs), SA = `requireSuperAdmin`, Auth = `requireAuth`.

## Group 1 — Product/catalogue and taxonomy CRUD (`routes/catalogue.ts`, `routes/storefront.ts`)

All currently Ops-only, no DB permission enforced. Actual behavior inspected
(product/variant/taxonomy writes mutate sellable catalogue data; reads are
catalogue browse used by daily operations, e.g. barcode lookup flows).

| Method + route | Behavior | Proposed permission |
|---|---|---|
| GET `/admin/products` | product list (read) | `products.read` (new) |
| POST `/admin/products` | create product | `products.manage` |
| PATCH `/admin/products/:id` | update/archive product | `products.manage` |
| PATCH `/admin/products/:id/draft` | draft autosave | `products.manage` |
| POST `/admin/products/:productId/variants` | create variant (manual) | `products.manage` |
| POST `/admin/products/:productId/variants/generate` | generate variants | `products.manage` |
| PATCH `/admin/products/:productId/variants/:variantId` | update variant | `products.manage` |
| PATCH `/admin/products/:productId/variants` | batch variant update | `products.manage` |
| POST `.../barcode/generate`, `.../barcode/assign`, `.../barcodes/generate-missing` | barcode writes | `products.manage` |
| GET `/admin/categories`, `/admin/collections`, `/admin/attributes` | taxonomy reads | `products.read` (new) |
| POST/PATCH/DELETE categories, collections, attributes, attribute values | taxonomy writes | `products.manage` |
| GET `/admin/products/:productId/collections` | read | `products.read` (new) |
| PUT `/admin/products/:productId/collections` | assign collections | `products.manage` |
| GET `/admin/products/:id` (`storefront.ts:87`) | product read | `products.read` (new) |

Effect: catalogue writes become admin-only (staff holds no `products.manage` —
matches the approved staff scope: inventory/orders/fulfillment only). Catalogue
reads stay available to staff via the new read slug (staff scope explicitly
includes "read product and stock information").

## Group 2 — Media (`routes/product-media.ts`, `routes/media.ts`)

Product-image routes mutate catalogue data (create/reorder/update/primary/
replace/delete, all product-scoped with IDOR re-verification, audited).

| Method + route | Proposed permission |
|---|---|
| GET `/admin/products/:productId/images` | `products.read` (new) |
| POST/PATCH/DELETE image routes (6) | `products.manage` |
| POST `/media/sign-upload` context=`product` (in-handler Ops check) | `products.manage` (in-handler, product context only) |
| POST `/media/sign-upload` context=`profile` | unchanged (Auth-only, self-scoped; customer avatar flow preserved) |

## Group 3 — Coupons and reviews (`routes/admin.ts`)

Coupon CRUD creates/updates discount instruments; review moderation flips UGC
visibility (audited `REVIEW_MODERATED`). Neither fits `products.manage`
accurately; both are outside staff scope. New slugs (admin-only grants):

| Method + route | Proposed permission |
|---|---|
| GET `/admin/coupons` | `coupons.manage` (new) |
| POST `/admin/coupons`, PATCH `/admin/coupons/:id` | `coupons.manage` (new) |
| GET `/admin/reviews` | `reviews.moderate` (new) |
| POST `/admin/reviews/:id/moderate` | `reviews.moderate` (new) |

## Group 4 — Customer directory (`routes/admin.ts`)

List/detail are data-minimized reads; PATCH edits names/phone (ops) with status
changes additionally Admin-gated in-handler. Evidence: `admin-customers-authz`
test blesses "authorized STAFF can read a customer record" (intended staff
read), while staff contact-field writes are account administration outside the
approved staff scope.

| Method + route | Proposed permission |
|---|---|
| GET `/admin/customers`, GET `/admin/customers/:id` | `customers.read` (staff grant PROPOSED — justified below) |
| PATCH `/admin/customers/:id` | `customers.manage` (admin-only; staff loses name/phone edits) |

`customers.read` for staff is an explicitly documented grant-matrix addition:
read-only, needed for order-support lookup, no administration capability.
`customers.manage` stays admin-only; the in-handler admin check for status
changes is retained.

## Group 5 — Payment reads and manual verify/reject (`routes/admin.ts`, `routes/payments.ts`)

GET `/admin/payments` is read-only visibility (Ops). Manual verify/reject
(Fin-gated) attest external M-Pesa receipt validity and transition payments to
PAID/FAILED — financial execution. New slugs, admin-only grants:

| Method + route | Proposed permission |
|---|---|
| GET `/admin/payments`, GET `/admin/payments/manual-pending` | `payments.read` (new) |
| POST `/admin/payments/:paymentId/verify`, `.../reject` | `payments.manage` (new) |

## Group 6 — Analytics and audit logs (`routes/analytics.ts`, `routes/admin.ts`)

13 analytics GETs (overview/sales/products/categories/customers/inventory/
payments/fulfillment/delivery/returns/quality/definitions/export) are
management reporting; audit-log viewer exposes actor history. Outside staff
scope; existing slugs fit accurately; admin-only grants already seeded.

| Method + route | Proposed permission |
|---|---|
| All GET `/admin/analytics/*` (incl. export) | `analytics.read` |
| GET `/admin/audit-logs` | `audit.read` |

## Group 7 — Notification operations (`routes/notifications.ts`)

Admin queue read vs outbox drain / delivery retry (mutations with external
effect). Existing slugs fit; admin-only grants already seeded. Account-scoped
routes and HMAC webhooks untouched.

| Method + route | Proposed permission |
|---|---|
| GET `/admin/notifications` | `notifications.read` |
| POST `/admin/notifications/process`, POST `/admin/notifications/:id/resend` | `notifications.manage` |

## Group 8 — Settings (`routes/admin.ts`)

GET `/admin/settings` returns shipping zones/methods/rates (non-secret config;
secrets stay in env). **Intentionally left role-gated (Ops):** no existing slug
fits, and `settings.manage` must NOT be granted to admin merely to make this
work (explicit constraint). `settings.manage` remains a reserved, ungranted,
super-admin-only slug. Documented residual, not a gap to force.

## Group 9 — Reservation sweep (`routes/admin.ts`)

POST `/admin/inventory/reservations/release-stale` releases stale unpaid
reservations (inventory `quantityReserved` mutation, audited
`INVENTORY_ADJUSTED`). Semantics fit `inventory.manage` accurately; staff
retains access (holds the grant); revocation becomes effective.

## Group 10 — Refund initiation (`routes/returns.ts`, `lib/returns.ts`)

Lifecycle analysis (verified in code):
- `requestRefund` (`POST /admin/returns/:id/refund`, currently Ops-gated):
  creates a `Refund` row with status **PENDING** — a financial obligation record,
  NOT money movement (no provider call). Guards: return must be
  `APPROVED_FOR_RESOLUTION` + type `REFUND`; requires a PAID payment; amount
  capped by refundable balance (`SUCCEEDED` refunds vs payment amount);
  idempotent per return (`if (request.refund) return`) plus unique client
  `idempotencyKey`; runs in a transaction.
- `completeManualRefund` (`POST /admin/refunds/:id/process`, Fin +
  `refunds.process`): attests external execution (provider reference), writes
  the `SUCCEEDED` transaction, updates payment status, resolves the return.
- Initiation and completion are **distinct capabilities**: obligation creation
  vs execution attestation. Conflating them under `refunds.process` would grant
  initiation to every completion-authorized actor without distinction, and
  leaving initiation Ops-gated lets staff create financial obligations.
- Decision: new `refunds.request` permission (resource `refunds`, action
  `request`), admin-only grant, enforced as
  `[requireFinancialAccess, requirePermission('refunds.request')]` — staff is
  excluded by BOTH the financial role gate and the missing grant (defense in
  depth, consistent with completion). No staff grant: unjustified by the
  approved staff scope. Customer return/refund request flows (`POST /returns`,
  customer reads) are untouched.

## Returns workflow operations (`routes/returns.ts`)

Queue/detail/review/approve/reject/receive are order-disposition state
transitions on return requests → `orders.manage` (existing slug, accurate fit;
staff holds it, so access preserved while revocation becomes effective).
`inspect` additionally restocks inventory (`RETURN` movements) → requires BOTH
`orders.manage` AND `inventory.manage` (both held by staff and admin).
No grant-matrix change needed for this group.

## Dashboard (`routes/admin.ts`)

GET `/admin/dashboard` aggregate read → `dashboard.read` (both roles already
granted; no access change; revocation becomes effective).

## New permission slugs proposed (6) with intended grants

| Slug | Resource/action | Admin | Staff | Rationale |
|---|---|---|---|---|
| `products.read` | products/read | ✓ | ✓ | staff "read product and stock information" is explicitly in scope |
| `refunds.request` | refunds/request | ✓ | — | initiation ≠ completion (Step 3); staff has no financial scope |
| `coupons.manage` | coupons/manage | ✓ | — | no fitting existing slug; outside staff scope |
| `reviews.moderate` | reviews/moderate | ✓ | — | no fitting existing slug; outside staff scope |
| `payments.read` | payments/read | ✓ | — | no fitting existing slug; outside staff scope |
| `payments.manage` | payments/manage | ✓ | — | financial execution attestation; outside staff scope |

Plus one grant addition to an existing slug: `customers.read` → staff (read-only
support lookup; justified by the authz spec test blessing staff reads).
No other grant-matrix changes. No `users.manage`/`roles.manage`/`settings.manage`
grants to anyone. Super-admin wildcard covers all (no code change).

## Test impact (fixtures to update; hermetic stamp roles, no canonical mutation)

Suites using staff on newly-gated writes must switch operators to admin (with
stamp grants) or assert 403: `catalogue`, `variant-manual`, `variant-batch`,
`variant-generation`, `barcode`, `product-lifecycle`, `product-media`, `media`
(product contexts), `rbac` (staff customer-edit → 403; staff dashboard needs
`dashboard.read`), `smoke` (analytics/overview → staff 403), `commerce`
(sweep staff needs `inventory.manage`), `admin-dashboard-customers` (staff
dashboard needs `dashboard.read`), `admin-customers-authz` (staff read needs
`customers.read`; any staff PATCH → 403). New focused tests will cover each
group: 401/403 matrix, revocation, read≠write, batch/nested coverage, refund
initiation/completion separation, SA-only administration preserved.
