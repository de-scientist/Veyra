# JB Mercantile — Admin & Staff RBAC Configuration: Completion Report

Date: 2026-10-16. Scope: local implementation + verification only.
No production database was connected, seeded, or modified. No roles were
assigned to any registered account. Phase A audit: `docs/ADMIN-STAFF-RBAC-AUDIT.md`.

## 1. Audit findings (source-code evidence; no production DB inspected)

- Data model (`prisma/schema.prisma`): `Role` (unique slug), `Permission`
  (unique slug + resource/action), `UserRole` (unique pair), `RolePermission`
  (unique pair). No bootstrap/sync logic exists outside `prisma/seed.ts`.
- Permission catalogue (`apps/api/src/lib/permissions.ts`) defines 19 slugs;
  the old seed created only 11 (missing `dashboard.read`, `refunds.process`,
  `customers.read/manage`, `users.manage`, `roles.manage`, `analytics.read`,
  `settings.manage`).
- Old seed grants: admin 11/11, super_admin same 11 rows, staff only
  `products.manage` + `fulfillment.view/process` + `delivery.manage` (no
  `inventory.manage`, no `orders.manage`), customer none.
- **Critical gap (confirmed, not assumed): `requirePermission` existed with ZERO
  route call sites.** All business routes enforced only coarse role-slug gates
  (`requireOperationsAccess` / `requireFinancialAccess` / `requireSuperAdmin`),
  so database grants were decorative and revocation removed no access.
- Customer suspend path is Admin-gated in-handler and role/permission/user-role
  administration is super-admin-only (both PASS, preserved untouched).

## 2. Permission matrix (as seeded + enforced)

| Permission | Admin | Staff | Customer | Super Admin |
|---|---|---|---|---|
| `dashboard.read` | ✓ | ✓ | — | ✓ (wildcard `*` in code) |
| `products.manage` | ✓ | — | — | ✓ |
| `inventory.manage` | ✓ | ✓ | — | ✓ |
| `categories.manage` | ✓ | — | — | ✓ |
| `collections.manage` | ✓ | — | — | ✓ |
| `orders.manage` | ✓ | ✓ | — | ✓ |
| `fulfillment.view` | ✓ | ✓ | — | ✓ |
| `fulfillment.process` | ✓ | ✓ | — | ✓ |
| `delivery.manage` | ✓ | ✓ | — | ✓ |
| `refunds.process` | ✓ | — | — | ✓ |
| `customers.read` / `customers.manage` | ✓ | — | — | ✓ |
| `notifications.read` / `notifications.manage` | ✓ | — | — | ✓ |
| `audit.read` | ✓ | — | — | ✓ |
| `analytics.read` | ✓ | — | — | ✓ |
| `users.manage` / `roles.manage` / `settings.manage` | — | — | — | ✓ (wildcard only; no seed rows) |

Staff deliberately lost the old `products.manage` seed default (out of its
inventory/orders/fulfillment scope). Customer: no grants. Super Admin: unchanged
(code wildcard; seed mirrors the admin set for truthful directory listings).

## 3. Files changed (reason each)

- `prisma/seed.ts` — full 19-permission catalogue + least-privilege admin (16)
  / staff (6) grant sets via idempotent upserts; additive only, never deletes
  custom grants; bootstrap `admin@veyra.local` untouched.
- `apps/api/src/routes/catalogue.ts` — `requirePermission('inventory.manage')`
  added (AND with existing Ops gate) on 7 inventory endpoints.
- `apps/api/src/routes/admin.ts` — `requirePermission('orders.manage')` added
  on 3 order endpoints.
- `apps/api/src/routes/fulfillment.ts` — `fulfillment.view` (4 GETs),
  `fulfillment.process` (start/pick/pack), `delivery.manage` (3 delivery POSTs).
- `apps/api/src/routes/returns.ts` — `requirePermission('refunds.process')`
  added on refund completion (financial gate retained).
- `apps/api/src/rbac-grants.test.ts` (new, 16 tests) — grant matrix, read≠write,
  revocation, idempotency, registration/customer/super-admin regression.
- `apps/api/src/test-helpers.ts` (new) — hermetic stamp-scoped grant helper so
  fixtures never mutate canonical roles (parallel-safe).
- 7 fixture updates (`smoke`, `barcode`, `order-cancel`, `variant-batch`,
  `product-lifecycle`, `fulfillment`, `fulfillment-eligibility`) — staff users
  gain explicit stamp-scoped grants for enforced routes; expectations unchanged.
- `docs/ADMIN-STAFF-RBAC-AUDIT.md` (new) — Phase A deliverable.
- `docs/ADMIN-STAFF-RBAC-CONFIGURATION-REPORT.md` (this file).

## 4. Route enforcement changes (21 endpoints, all strictly stricter: Ops/Fin gate AND DB grant)

- Inventory (7): `GET /admin/inventory`, `/lookup`, `/movements`, `/reservations`,
  `POST /:variantId/restock`, `/restock-batch`, `/:variantId/adjust`.
- Orders (3): `GET /admin/orders`, `GET /:orderNumber`, `POST /:orderNumber/cancel`.
- Fulfillment/delivery (10): queue/detail/eligibility/operations-users (view),
  start/pick/pack (process), delivery assign/status/details (delivery.manage).
- Refunds (1): `POST /admin/refunds/:id/process` (+`refunds.process`).
- No guard was weakened; no route became more permissive. Revoking a grant now
  removes access immediately (per-request DB resolution, no cache).

## 5. Test results (canonical runner: root `npx vitest run`)

- New `rbac-grants.test.ts`: 16/16 pass.
- RBAC/admin suites (`rbac`, `admin-roles`, `admin-users`, `admin-customers-authz`,
  `admin-dashboard-customers`): 48/48 pass.
- Fixture/commerce suites (`security`, `smoke`, `barcode`, `order-cancel`,
  `variant-batch`, `catalogue`): 73/73 pass.
- Fulfillment/commerce/lifecycle/auth (`fulfillment`, `fulfillment-eligibility`,
  `product-lifecycle`, `commerce`, `account-lifecycle`, `google-auth`, `lib/auth`):
  pass (incl. rerun 35/35 + 42/42 after isolating load flakes).
- Remaining route suites (variants, media, product-media, storefront,
  catalogue-pricing, contracts, cors, account-avatar): 74/74 pass.
- `npm run typecheck --workspace @veyra/api`: clean. `npm run lint`: 0 errors
  (1 pre-existing warning in untouched `storefront.ts`). `npm run build`
  (API): clean. Frontend build skipped (no frontend changes).
- Known non-issues: 3 transient 5s timeouts under 7-file parallel load
  (bcrypt, commerce price, eligibility) all pass on rerun; 1 account-lifecycle
  failure was caused by running vitest from `apps/api` instead of repo root
  (cwd-dependent contract test) and passes under the canonical root runner.
  No pre-existing failures were concealed; nothing in the diff touches those paths.

## 6. Database / migration status

- NO migration required or created (all tables/constraints pre-existed).
- NO production seed or production data change (no production connection exists here).
- Local dev DB (`veyra_dev1`): seed run twice — "Seed complete" both times, no
  errors; verified read-only afterwards: 19 permissions, exactly 1 row per
  canonical role, admin 16 / staff 6 / customer 0 / super_admin 16 grants,
  zero duplicates, zero leftover test fixtures.
- Existing deployments keep stale custom grants (seed is additive); excess grants
  (e.g. staff `products.manage`) must be revoked via the existing super-admin
  endpoint with account-holder approval — out of scope, tracked as residual risk.

## 7. Residual risks

- Role-gated but NOT yet DB-permission-enforced: product/catalogue/taxonomy/media
  CRUD, coupons, reviews, customer directory, payments reads, manual
  verify/reject, analytics, audit-logs, notifications ops, settings,
  reservation sweep, and refund initiation (`POST /admin/returns/:id/refund`
  remains Ops-gated — staff-role holders can initiate, though only
  `refunds.process` holders complete). Next step: extend the same
  `requirePermission` AND-pattern per area with super-admin approval.
- `users.manage` / `roles.manage` / `settings.manage` exist in the catalogue with
  no grants and no enforcing routes (reserved for future use; administration
  stays super-admin-only by guard).
- Full-suite green was established per-area, not via one single full run
  (load-flake avoidance); a CI full run is recommended before release.

## 8. Release status

LOCAL IMPLEMENTATION ONLY. No deployment performed or verified. No account
assignments made. Permission matrix above is presented for approval before any
account assignments. Session/cookie semantics, customer registration/login/
Google flows, order/inventory/fulfillment behavior, and the super-admin-only
rule for role definition/grant/assignment changes are all preserved and
test-covered.
