# JB Mercantile — Admin & Staff RBAC Configuration: Phase A Audit

Date: 2026-10-16. Source of truth: repository source code and seed files.
No production database was connected. No live database contents were inspected —
all role/grant statements below are derived from `prisma/seed.ts` and source code,
**not** from a running database. Local/test database state is UNKNOWN unless a
seed/test run establishes it.

## A1. Data model (prisma/schema.prisma)

- `User`, `Role`, `Permission`, `UserRole`, `RolePermission` exist as database-backed models.
- `Role`: `name @unique`, `slug @unique`. `Permission`: `name @unique`, `slug @unique`,
  `resource`, `action`. `UserRole @@unique([userId, roleId])`.
  `RolePermission @@unique([roleId, permissionId])` — idempotent upserts are safe, no duplicates possible.
- `UserRoleName` enum (`CUSTOMER, STAFF, ADMIN, SUPER_ADMIN`) is defined but unused;
  roles are addressed by `Role.slug`.
- No permission-synchronisation or bootstrap logic exists outside `prisma/seed.ts`.
  There is no startup sync, no `ensurePermissions`, no migration-resident grant.

## A2. Canonical roles and permission catalogue (source-code evidence)

`prisma/seed.ts` upserts four canonical roles: `admin`, `staff`, `customer`, `super_admin`.
No duplicate creation possible (`upsert` on unique `slug`).

`apps/api/src/lib/permissions.ts` documents a 19-slug catalogue (`PERMISSIONS`).
`prisma/seed.ts` creates only **11** of them. Missing from the seed:

| Missing slug | Catalogue entry |
|---|---|
| `dashboard.read` | DASHBOARD_READ |
| `refunds.process` | REFUNDS_PROCESS |
| `customers.read` | CUSTOMERS_READ |
| `customers.manage` | CUSTOMERS_MANAGE |
| `users.manage` | USERS_MANAGE |
| `roles.manage` | ROLES_MANAGE |
| `analytics.read` | ANALYTICS_READ |
| `settings.manage` | SETTINGS_MANAGE |

(The catalogue also implies `products.manage`, `inventory.manage`, `categories.manage`,
`collections.manage`, `orders.manage`, `fulfillment.view`, `fulfillment.process`,
`delivery.manage`, `notifications.read/manage`, `audit.read` — all 11 seeded.)

## A3. Current seed grants (source-code evidence, NOT live-DB evidence)

- `admin`: all 11 seeded permissions.
- `super_admin`: same 11 rows (plus a code-level `' * '` wildcard in
  `getUserPermissionSlugs`, `lib/permissions.ts:79-95` — the ONLY wildcard in the system).
- `staff`: `products.manage` + `fulfillment.view` + `fulfillment.process` + `delivery.manage`
  (4 grants). Notably staff has **no** `inventory.manage` and **no** `orders.manage`
  despite its operational scope, and **does** hold full `products.manage`.
- `customer`: no grants.

## A4. Authorization guards (verified current code)

- `apps/api/src/middleware/auth.ts`: `requireAuth` (cookie session, DB lookup per request,
  active-status enforcement), `requireOperationsAccess` (role slugs staff/admin/super_admin),
  `requireFinancialAccess` / `requireAdminAccess` (role slugs admin/super_admin),
  `requireSuperAdmin`, `requireRole(role)` factory, and `requirePermission(...slugs)`
  (DB-authoritative via `getUserPermissionSlugs`, per-request, no cache — revocation is
  effective immediately).
- **Critical finding: `requirePermission` has ZERO route call sites** (only its definition
  and a test probe reference it). The previous review's finding is CONFIRMED still true:
  database grants are decorative — every business route enforces only coarse role-slug gates.
  Revoking a `RolePermission` row today removes NO access.
- `requireRole` factory form is fixed and has no production call sites (safe).

## A5. Route enforcement matrix (verified current code)

Prefix `/api/v1`. Ops = `requireOperationsAccess`, Fin = `requireFinancialAccess`,
SA = `requireSuperAdmin`, Auth = `requireAuth`.

| Route group | Guard | DB permission enforced? |
|---|---|---|
| `GET /admin/dashboard` | Ops | NO |
| `GET/POST/PATCH /admin/products*`, variants, barcodes | Ops | NO |
| `GET /admin/inventory*`, `POST restock / adjust / restock-batch` | Ops | NO |
| Categories / collections / attributes (+deletes) | Ops | NO |
| Product images | Ops | NO |
| `GET /admin/orders`, `GET /:orderNumber`, `POST :orderNumber/cancel` | Ops | NO |
| `GET /admin/payments`, manual-pending/verify/reject | Ops / Fin | NO |
| Fulfillment queue/detail/eligibility/start/pick/pack, delivery assign/status/details | Ops | NO |
| Returns review/approve/reject/receive/inspect/refund | Ops | NO |
| `POST /admin/refunds/:id/process` | Fin | NO |
| `GET /admin/customers*`, `PATCH :id` (status change additionally Admin-gated in-handler) | Ops (+Admin for status) | NO |
| Users / roles / permissions / user-role assignment | SA | n/a (correctly SA-only) |
| Analytics incl. export, audit-logs, reviews, coupons, notifications ops, settings, reservation sweep | Ops | NO |
| Customer self-service (`/account/*`, `/returns`, wishlist) | Auth + owner scope | n/a (correct) |
| Registration (`/auth/register`, Google) assigns `customer` only; schemas strip role input | — | PASS, unchanged |

Gaps: (G1) no route enforces DB grants; (G2) seed catalogue incomplete (8 slugs);
(G3) staff seed grants mismatch scope (has `products.manage`, lacks `inventory.manage` /
`orders.manage`); (G4) `POST /admin/returns/:id/refund` (refund initiation) is Ops-gated,
so staff-role holders can initiate refunds; only completion is Fin-gated;
(G5) customer suspend path is Admin-gated in-handler (previously flagged gap, now fixed — PASS);
(G6) role/permission/user-role administration is SA-only (PASS).

## A6. Proposed grants

Admin (16): `dashboard.read`, `products.manage`, `inventory.manage`, `categories.manage`,
`collections.manage`, `orders.manage`, `fulfillment.view`, `fulfillment.process`,
`delivery.manage`, `refunds.process` (already Fin-authorized today), `customers.read`,
`customers.manage`, `notifications.read`, `notifications.manage`, `audit.read`,
`analytics.read`. Explicitly NOT: `users.manage`, `roles.manage`, `settings.manage`.

Staff (6): `dashboard.read`, `inventory.manage`, `orders.manage`, `fulfillment.view`,
`fulfillment.process`, `delivery.manage`. Explicitly NOT: catalogue/taxonomy management,
refunds, customer administration, analytics, media admin, settings, role administration.
`products.manage` is REMOVED from staff seed defaults (out of inventory/orders/fulfillment scope).

Customer: no grants. Super_admin: code wildcard; seed rows unchanged in effect.

## A7. Files likely to change

1. `prisma/seed.ts` — full 17-permission catalogue + least-privilege admin/staff grant sets
   (idempotent upserts; additive only, never deletes existing custom grants).
2. `apps/api/src/routes/catalogue.ts` — add `requirePermission('inventory.manage')` to the   7 inventory endpoints (preHandler arrays; existing Ops gate retained).
3. `apps/api/src/routes/admin.ts` — add `requirePermission('orders.manage')` to the
   3 order endpoints.
4. `apps/api/src/routes/fulfillment.ts` — add `fulfillment.view` (4 GETs),
   `fulfillment.process` (start/pick/pack), `delivery.manage` (3 delivery POSTs).
5. `apps/api/src/routes/returns.ts` — add `requirePermission('refunds.process')` to
   `POST /admin/refunds/:id/process` (Fin gate retained).
6. New `apps/api/src/rbac-grants.test.ts` — grant matrix + revocation + idempotency tests.
7. Fixture updates (staff users gain stamp-scoped grant roles; no canonical-role mutation):
   `smoke.test.ts`, `routes/barcode.test.ts`, `routes/fulfillment.test.ts`,
   `routes/fulfillment-eligibility.test.ts`, `routes/order-cancel.test.ts`,
   `routes/product-lifecycle.test.ts`, `routes/variant-batch.test.ts`.
8. New `docs/ADMIN-STAFF-RBAC-CONFIGURATION-REPORT.md` — completion report (this file is
   the Phase A portion; implementation/test/verification sections appended in Phase E).

## A8. Migration requirements and regression risks

- NO database migration required: all tables, columns, and uniqueness constraints exist.
- NO production seed or data change; seed runs only against local/dev/test databases.
- Existing deployments hold stale grants (e.g. staff `products.manage`, missing staff
  `inventory.manage`/`orders.manage`). Re-running the idempotent seed ADDS missing default
  grants; removing excess grants requires the existing SA-only revoke endpoint (follow-up,
  per-account approval — out of scope).
- Enforcement is AND (role gate retained + permission required): strictly stricter than
  today. Bare-role test fixtures must gain explicit grants (see A7.7). No route becomes
  more permissive; no guard is weakened.
- Residual (documented, unchanged): catalogue/taxonomy/media/coupon/review/customer/
  analytics/notification/settings/payment-read routes remain role-gated; refund initiation
  (`POST /admin/returns/:id/refund`) remains Ops-gated.
