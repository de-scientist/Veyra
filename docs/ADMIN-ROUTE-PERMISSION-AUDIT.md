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

## Implementation record (Phase 2, completed 2026-10-17)

### Final route-to-permission mapping (all AND-composed with the pre-existing role gate)

- Catalogue reads (GET products, categories, collections, attributes,
  product-collections, product detail incl. `storefront.ts`, product images
  list) → `products.read`. All catalogue/taxonomy/barcode writes, batch
  variant update, collections PUT, product-media writes, product-context
  `sign-upload` (in-handler) → `products.manage`.
- Coupons (list/create/update) → `coupons.manage`; reviews (list/moderate) →
  `reviews.moderate`.
- Customer list/detail → `customers.read`; customer PATCH →
  `customers.manage` (in-handler admin check for status changes retained).
- Payment list + manual-pending → `payments.read`; manual verify/reject →
  `payments.manage`.
- All 13 analytics routes (incl. export) → `analytics.read`; audit-log
  viewer → `audit.read`.
- Notifications list → `notifications.read`; process/resend →
  `notifications.manage`.
- Dashboard → `dashboard.read`; reservation sweep → `inventory.manage`.
- Returns queue/detail/review/approve/reject/receive → `orders.manage`;
  inspect → `orders.manage` + `inventory.manage` (restocks inventory).
- Refund initiation → `[requireFinancialAccess, refunds.request]` (was Ops-only;
  staff excluded by both gate and missing grant). Refund completion unchanged:
  `[requireFinancialAccess, refunds.process]`.
- Intentionally left role-gated: `GET /admin/settings` (no fitting grant;
  `settings.manage` stays reserved/ungranted per constraint), SA-only
  role/permission/user administration, customer self-service, public
  payment/webhook endpoints.

### Files changed

`lib/permissions.ts` (+6 slugs), `prisma/seed.ts` (25-permission catalogue;
admin 22 / staff 8 grants), routes `catalogue`, `storefront`, `product-media`,
`media`, `admin`, `returns`, `payments`, `analytics`, `notifications`; new
`src/rbac-admin-routes.test.ts` (20 tests) + shared `src/test-helpers.ts`
extension usage; fixture updates in 14 existing suites (operators switched to
admin with stamp grants where writes are admin-only; staff keeps stamp-scoped
reads; `rbac` staff-edit now asserts 403; `smoke` analytics now asserts staff
403). No frontend changes. No refactors.

### New permission slugs and grants

`products.read` (admin+staff), `refunds.request` (admin),
`coupons.manage` (admin), `reviews.moderate` (admin), `payments.read`
(admin), `payments.manage` (admin); plus `customers.read` granted to staff
(read-only support lookup; administration stays admin-only). No
`users.manage`/`roles.manage`/`settings.manage` grants to anyone. Super-admin
wildcard unchanged.

### Refund initiation/completion policy

Initiation (`POST /admin/returns/:id/refund`) creates a PENDING obligation row
only — no provider call, no money movement; guarded by state eligibility
(`APPROVED_FOR_RESOLUTION` + REFUND type + PAID payment), refundable-balance
cap, per-return idempotency + unique client key, all transactional (verified in
`lib/returns.ts`). Completion attests external execution. Separate slugs
(`refunds.request` vs `refunds.process`), both admin-only; staff holds
neither. Customer return/refund request flows untouched. No live providers
touched in tests (404-probes on unknown IDs; no refunds executed).

### Test results

- New `rbac-admin-routes.test.ts`: 20/20 (401/403 matrix per group, missing-grant
  denial, revocation, read≠write, batch/nested coverage, initiation/completion
  separation, SA-only preserved, settings residual pinned).
- Prior `rbac-grants.test.ts`: 16/16 (hermeticity hardened with canonical-grant
  revoke/restore helpers after seeded canonical grants surfaced in the shared DB).
- Full canonical suite (`npx vitest run` from repo root): 722/724, then 20/20
  on the fixed file. The 2 failures were seed-state sensitivity in the new
  file itself (canonical staff/admin carry seeded grants in shared DBs), fixed
  with revoke-around-assert helpers — not product-code defects.
- `npm run typecheck --workspace @veyra/api`: clean.
  `npm run lint --workspace @veyra/api`: 0 errors (1 pre-existing warning in
  untouched `storefront.ts`). `npm run build --workspace @veyra/api`: clean.
  Frontend build skipped (no frontend changes).
- No failures concealed; no pre-existing failures observed in affected areas.

### Test-hermeticity note (important for future suites)

The shared dev database carries the seeded grant matrix on canonical roles.
Fixtures must NEVER assert bare-canonical-role denials on staff/admin-scope
routes, and must use stamp-scoped grant roles (`src/test-helpers.ts`) plus the
`withCanonicalGrantsRevoked` pattern (see both rbac suites) for
grant-absence assertions. Positives via stamp grants are immune to seed state.

### Migration status

No migration required or created. Seed (`npm run db:seed`) run twice against
local dev `veyra_dev1`: "Seed complete" both times; read-only verification:
25 permissions, 1 row per canonical role, admin 22 / staff 8 / customer 0 /
super_admin 22 grants, zero duplicates, zero leftover fixtures.

### Production confirmation

No production database connected, seeded, or modified. No production data,
roles, grants, credentials, or account assignments changed. No deployment
performed.

### Release status

LOCAL IMPLEMENTATION ONLY; deployment not performed. Grant-matrix changes
(`products.read`, `refunds.request`, `coupons.manage`, `reviews.moderate`,
`payments.read`, `payments.manage`, staff `customers.read`) are presented for
review before any account assignments, per the task.

## Test impact (fixtures updated; hermetic stamp roles, no canonical mutation)

Suites using staff on newly-gated writes must switch operators to admin (with
stamp grants) or assert 403: `catalogue`, `variant-manual`, `variant-batch`,
`variant-generation`, `barcode`, `product-lifecycle`, `product-media`, `media`
(product contexts), `rbac` (staff customer-edit → 403; staff dashboard needs
`dashboard.read`), `smoke` (analytics/overview → staff 403), `commerce`
(sweep staff needs `inventory.manage`), `admin-dashboard-customers` (staff
dashboard needs `dashboard.read`), `admin-customers-authz` (staff read needs
`customers.read`; any staff PATCH → 403). New focused tests cover each
group (see Implementation record above): 401/403 matrix, revocation, read≠write, batch/nested coverage, refund
initiation/completion separation, SA-only administration preserved.
