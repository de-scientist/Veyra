# Admin RBAC Implementation Report

Date: 2026-09-19. Pre-remediation baseline: [ADMIN-ACCESS-RBAC-AUDIT.md](ADMIN-ACCESS-RBAC-AUDIT.md). All statements below were verified by code inspection, executed tests, typecheck, lint, and build — no fake security claims.

## Executive Summary

The backend already enforced coarse-grained authorization (customer → 403 on all admin APIs, tested). Remediation closed the real gaps: inactive-account authentication, staff over-privilege on user lifecycle, missing super-admin bootstrap/management, scattered authorization logic, and the admin-access UX (canonical dashboard route, 403 page, redirect flow, account entry point). No schema migration was required (data-only change; forward-only migration discipline preserved).

## Current Admin Access (Post-Remediation)

1. User opens `/admin` → server redirect to `/admin/dashboard`.
2. `AdminShell` loads `GET /api/v1/auth/me`.
3. Unauthenticated → `/login?redirect=/admin/dashboard`; after login the user returns to the admin.
4. Authenticated without `dashboard.read` → `/admin/unauthorized` (403, safe messaging).
5. Authorized staff/admin/super-admin → dashboard renders; every data call re-authorizes server-side.

## Changes Implemented

### Backend (`apps/api`)

- `src/lib/permissions.ts` (new): single RBAC catalog — `OPERATIONS_ROLE_SLUGS`, `FINANCIAL_ROLE_SLUGS`, `SUPER_ADMIN_SLUGS`, canonical `PERMISSIONS` slugs, `getUserPermissionSlugs()` (DB-authoritative; super_admin wildcard `['*']` exists only here), `userHasPermissionSlugs()` (pure, unit-tested).
- `src/middleware/auth.ts`: added `assertUserActive()` (ACTIVE-only; `ACCOUNT_SUSPENDED` / `ACCOUNT_DELETED` / `ACCOUNT_INACTIVE`); `requireAuth` enforces it on every request; added centralized `requireOperationsAccess`, `requireFinancialAccess`, `requireAdminAccess`, `requireSuperAdmin`, and DB-backed `requirePermission(...)`. `requireRole` retained for compatibility and now also enforces active status.
- `src/middleware/operations.ts`: now pure re-exports of the centralized guards (import surface unchanged; behavior unchanged).
- `src/routes/auth.ts`: login and `/auth/me` reject non-ACTIVE accounts (403, distinct codes).
- `src/routes/admin.ts`:
  - `PATCH /admin/customers/:id`: `status` changes require `requireAdminAccess` (staff keep name/phone edits); audit now records before/after status.
  - New `GET /admin/roles` (super-admin): roles with permissions + member counts.
  - New `POST /admin/users/:id/roles` (super-admin): `{ role, action: assign|revoke }`, audited `USER_ROLE_CHANGED` with before/after, self-lockout denied (`SELF_LOCKOUT_DENIED`), deleted-user and unknown role/user handled safely. No public registration path exists.
- `prisma/seed.ts`: idempotent `super_admin` role + grant of all seeded permissions. No default super-admin credentials.

### Frontend (`apps/web`)

- `app/admin/dashboard/page.tsx` (new): dashboard content relocated verbatim (canonical route).
- `app/admin/page.tsx`: now `redirect('/admin/dashboard')`.
- `app/admin/unauthorized/page.tsx` (new): 403 page, static, no session fetch, no internals.
- `app/admin/AdminShell.tsx`: dashboard nav/brand point at `/admin/dashboard`; shell bypasses its gate for `/admin/unauthorized`; unauthenticated → `/login?redirect=...`; forbidden → `/admin/unauthorized` (distinguished by error code, including suspended-account sessions).
- `components/AuthForms.tsx`: `safeRedirectTarget()` (same-origin `/?...` only; blocks `//`, `:`, bad encoding) + login honors `?redirect=`; `app/login/page.tsx` wraps the form in `<Suspense>` (required by `useSearchParams`).
- `lib/admin-api.ts`: centralized UX permission helper `can()` (unknown permission → deny; documented UX-only).
- `components/AccountNav.tsx`: conditional **Admin Dashboard** entry via `can('dashboard.read', roles)`.

Branding, theme tokens, JB logos, and all business logic untouched.

## Final Role Matrix (Implemented)

| Capability | CUSTOMER | STAFF | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Storefront / own account | ✓ | ✓ | ✓ | ✓ |
| `/admin/dashboard` + ops modules | ✗ (403 page; API 403) | ✓ | ✓ | ✓ |
| Refund completion | ✗ 403 | ✗ 403 | ✓ | ✓ |
| Customer suspend/reinstate | ✗ 403 | ✗ 403 | ✓ (audited) | ✓ (audited) |
| Customer profile edits | ✗ 403 | ✓ | ✓ | ✓ |
| Role/permission management | ✗ 403 | ✗ 403 | ✗ 403 | ✓ (audited) |
| Self role escalation | stripped/denied | denied | denied | self super-admin revoke denied |

Granular per-endpoint permissions (e.g. staff catalogue-only) remain opt-in via `requirePermission(...)`; the seeded `RolePermission` rows back it. Current enforcement is role-tiered (fail-closed), not yet per-permission on every route — documented limitation, not a vulnerability (customers are blocked; staff over-reach is confined to non-lifecycle operations).

## API Protection (Post-Remediation Matrix)

| Endpoint | Guard | Customer | Staff | Admin | Super-admin |
|---|---|---|---|---|---|
| `GET /admin/*` reads | Ops | 403 | 200 | 200 | 200 |
| Admin mutations (catalogue/inventory/fulfillment/returns/coupons/reviews) | Ops | 403 | 200 | 200 | 200 |
| `PATCH /admin/customers/:id` profile fields | Ops | 403 | 200 | 200 | 200 |
| `PATCH /admin/customers/:id` `status` | Admin | 403 | 403 | 200 | 200 |
| `POST /admin/refunds/:id/process` | Financial | 403 | 403 | 200* | 200* |
| `GET /admin/roles`, `POST /admin/users/:id/roles` | Super-admin | 403 | 403 | 403 | 200 |
| `PATCH /account/profile` with `role`/`status` | Auth + strict schema | stripped | n/a | n/a | n/a |

`*` subject to refund existing / business-rule validation.

## Session Security

Opaque server-side sessions; roles re-loaded per request (immediate revocation on suspend/role change); revoked/expired rejected; logout revokes. PASS. Known non-vuln hygiene items (no rotation on login, `lastUsedAt` unwritten, `SESSION_SECRET` unused) unchanged.

## Audit Logging

Added: `CUSTOMER_UPDATED` before/after status; `USER_ROLE_CHANGED` before/after roles with actor/IP. No passwords/tokens/secrets logged. PASS.

## Automated Tests

- New `apps/api/src/rbac.test.ts` (20 tests, DB-backed via `app.inject`): status enforcement (login/session/`/auth/me`), customer isolation (reads, mutations, role assignment, self-profile injection), staff restrictions (suspend/refund/roles denied; dashboard + profile edits allowed), admin suspend/reinstate + immediate access loss + audit, super-admin role lifecycle + self-lockout + 404s, permission-helper pure tests. **20/20 pass.**
- Full suite: **14 files, 121 tests, all pass** (`npm test`).
- `npm run typecheck` (api + web): pass. `npm run lint`: pass (only pre-existing `<img>` warnings in unrelated files). `npm run build` (api + web): pass; `/admin`, `/admin/dashboard`, `/admin/unauthorized` all emitted.

## Remaining Risks / Known Limitations

1. Per-permission enforcement is opt-in (`requirePermission`) — staff currently hold broad operational power except user lifecycle and financial completion. Acceptable for single-store D2C ops; tighten per domain when business roles require it.
2. First super-admin requires direct DB promotion (documented SQL). No insecure default exists by design.
3. No Next.js `middleware.ts` — admin route protection is client-side UX + server-side API enforcement. Direct `/admin` navigation by a customer renders the shell briefly, then redirects; no admin data is fetchable (API 403).
4. Session rotation on login, `lastUsedAt` tracking, and `SESSION_SECRET` usage remain future hygiene.

## Manual Verification Required

- Browser: customer → `/admin` → 403 page; staff → dashboard, suspend attempt blocked server-side; admin → suspend works; super-admin → role assignment works. (Covered at API level by tests; UI flow NOT VERIFIED in a browser here.)
- Production: confirm `AUTH_SECRET`/`SESSION_SECRET` are long random values, `Secure` cookies active (`NODE_ENV=production`), and the dev bootstrap `admin@veyra.local / Admin123!` does not exist in production.
- Run `prisma/seed.ts` in staging to confirm idempotent `super_admin` provisioning.
