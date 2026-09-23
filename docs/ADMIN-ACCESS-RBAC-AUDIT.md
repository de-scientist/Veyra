# Admin Access & RBAC Audit — Current State (Pre-Remediation)

Date: 2026-09-19. Source of truth: actual repository code. Documentation contradictions are noted explicitly.

## 1. Current Admin URL

- **Admin entry (authoritative): `/admin`** — `apps/web/app/admin/page.tsx` renders the Operations Dashboard. There is **no `/admin/dashboard` frontend route** (verified: no `app/admin/dashboard/` directory).
- **API dashboard endpoint:** `GET /api/v1/admin/dashboard` (`apps/api/src/routes/admin.ts`).
- **Login:** `/login` (`apps/web/app/login/page.tsx`); register at `/register`. Post-login redirect is hard-coded to `/account` (`apps/web/components/AuthForms.tsx:35,93`).
- No `middleware.ts` exists anywhere in `apps/web`. `robots.ts` disallows `/admin/` for crawlers.

## 2. Current Login Flow

`apps/web/components/AuthForms.tsx` → `POST /api/v1/auth/login` (`apps/api/src/routes/auth.ts:158-192`) → `prisma.user.findUnique` by lowercased email → `bcrypt.compare` (hash cost 12; seed uses cost 10) → `Session` row created (`crypto.randomUUID`, 7-day expiry) storing only `SHA256(AUTH_SECRET:token)` → `Set-Cookie: veyra_session=<uuid>; HttpOnly; SameSite=Lax; Secure (prod only); Path=/; Max-Age=7d`.

- Register (`routes/auth.ts:100-156`) auto-assigns the `customer` role via `UserRole.upsert`; no role input is accepted (zod schemas strip unknown keys).
- `GET /auth/me` (`routes/auth.ts:221-260`) re-does the session lookup inline and returns `{ user: serializeUser, roles: string[] }`. `serializeUser` exposes no password hash (PASS).
- Logout (`routes/auth.ts:194-219`) revokes the current session server-side (`revokedAt`) and clears the cookie. No auth required; idempotent.
- No JWT, no refresh tokens, no Bearer support. `PasswordResetToken` / `EmailVerificationToken` models exist in Prisma but have no API routes (NOT VERIFIED).
- Cookie parsing is manual raw-`Cookie`-header splitting in three places (`middleware/auth.ts:9-25`, `routes/auth.ts:65-80`, `lib/shopping.ts`) instead of `request.cookies` from `@fastify/cookie` (fragile, not a vuln).
- Sessions are never rotated on login (old sessions stay valid until expiry) and `lastUsedAt` is never updated.

## 3. Current Session Mechanism

DB-backed opaque sessions (`prisma/schema.prisma` `Session`: `tokenHash @unique`, `expiresAt`, `revokedAt`, `userAgent`, `ipAddress`, Cascade delete). Revoked/expired sessions are rejected on every lookup. Role is **not** embedded in any token — it is re-loaded from the DB on every authenticated request (`middleware/auth.ts:26-45`), so role changes take effect immediately (no stale-privilege window). PASS.

## 4. Current Role Model

`User → UserRole → Role(slug)` (`prisma/schema.prisma`). `UserRole @@unique([userId, roleId])` (PASS). `UserRoleName` enum (`CUSTOMER, STAFF, ADMIN, SUPER_ADMIN`) is defined but **unused** by any model. Roles are addressed by `Role.slug` (`customer`, `staff`, `admin`, `super_admin`/`super-admin` aliases accepted in checks).

Seed (`prisma/seed.ts`) provisions `admin`, `staff`, `customer` + 11 permissions (all granted to `admin`; `staff` gets `products.manage` + `fulfillment.*` + `delivery.*`; `customer` gets none) + bootstrap `admin@veyra.local / Admin123!`.

**Discrepancy:** `docs/AUTHENTICATION.md:9` implies all four roles are seeded; actually **`super_admin` is never seeded** — no bootstrap super-admin exists.

## 5. Current Permission Model

`Permission(slug, resource, action)` + `RolePermission @@unique([roleId, permissionId])` exist and are seeded, but **no request-time permission check exists**. `hasRequiredPermission` / `buildPermissionKey` (`lib/auth.ts:19-37`) are exercised only by `lib/auth.test.ts` and never used as route guards; `requireRole` (`middleware/auth.ts:54-61`) has zero call sites. Enforcement is purely coarse role-slug gates:

- `requireOperationsAccess` (`middleware/operations.ts:8-16`): staff/admin/super_admin — used on **all** `/admin/*` reads and mutations (admin.ts, catalogue.ts, fulfillment.ts, returns.ts ops routes, notifications.ts ops routes, analytics.ts).
- `requireFinancialAccess` (`middleware/operations.ts:18-26`): admin/super_admin — used **once**: `POST /admin/refunds/:refundId/process` (`routes/returns.ts:88`).
- `lib/admin.ts:48-52` and `apps/web/lib/admin-api.ts:25-27` duplicate the operations-role set a third and fourth time (logic drift risk; all four currently agree).

## 6. Current Frontend Protection

Sole guard: `apps/web/app/admin/AdminShell.tsx:42-63` (client-side `useEffect`): `GET /auth/me` → `isOperationsRole(roles)` → otherwise `router.replace('/login')`; fetch failure also → `/login`. Consequences:

- A CUSTOMER navigating to `/admin` is bounced to `/login` (re-authenticating as the same customer loops back to `/login`). There is **no 403/unauthorized page** (`not-found.tsx` is 404-only).
- STAFF can access `/admin` and **every** admin module (nav `AdminShell.tsx:14-29` is a static 14-item list, no per-item filtering; only `requireFinancialAccess` blocks staff from refund completion server-side).
- No `Account → Admin Dashboard` link exists (`AccountNav.tsx`, `Header.tsx`, account dashboard quick-links contain no admin entry).
- Account pages have no guard at all (rely on API 401 surfacing as inline error UI). Login does not honor `?redirect=`.

Frontend checks are UX-only (stated in code comment `AdminShell.tsx:47`) — and correctly so, because every admin API independently enforces `requireOperationsAccess`. **Backend protection: PASS (coarse-grained).**

## 7. Current Backend Protection (Endpoint Matrix)

All routes below are under `/api/v1`. Auth = `requireAuth`; Ops = `requireOperationsAccess`; Fin = `requireFinancialAccess`.

| Endpoint | Guard | Customer result | Status |
|---|---|---|---|
| `GET /admin/dashboard`, `/admin/orders`, `/admin/orders/:n`, `/admin/payments`, `/admin/customers`, `/admin/customers/:id`, `/admin/audit-logs`, `/admin/reviews`, `/admin/coupons*`, `/admin/settings` | Ops | 403 | PASS |
| `PATCH /admin/customers/:id` (incl. `status` suspend) | Ops | 403 | **REVIEW — staff can suspend/reinstate (users.manage not restricted)** |
| `POST /admin/reviews/:id/moderate`, coupon create/update | Ops | 403 | PASS (coarse) |
| Catalogue/inventory mutations (`/admin/products*`, `/admin/inventory/*`) | Ops | 403 | PASS (coarse; staff === admin) |
| Fulfillment/delivery mutations | Ops | 403 | PASS (coarse) |
| Returns review/approve/reject/receive/inspect/refund | Ops + `sensitiveLimit()` | 403 | PASS |
| `POST /admin/refunds/:refundId/process` | Fin | 403 | PASS |
| `GET /admin/analytics/*`, export | Ops (+`authLimit` on export, audited) | 403 | PASS |
| `POST /auth/login|register` | rate-limited 10/min | — | PASS |
| `/account/*` (26 routes) | Auth + owner-scoped queries | 404 on cross-account (order, address, notification, session) | PASS (tested) |
| `PATCH /account/profile` schema | firstName/lastName/phone only | role/status injection stripped by zod | PASS |
| `POST /payments/mpesa/callback` | public + provider verification | — | NOT RE-AUDITED HERE |
| Email/SMS delivery webhooks | public + HMAC `X-Provider-Signature` | — | NOT RE-AUDITED HERE |

There are **no user/role/permission management endpoints** (no `POST /api/create-admin`, no role assignment API) — privilege-escalation via API role injection is structurally impossible today, but SUPER_ADMIN user administration is NOT IMPLEMENTED.

## 8. Current Role Matrix (Actual)

| Capability | CUSTOMER | STAFF | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Storefront / own account (owner-scoped) | ✓ | ✓ | ✓ | ✓ (role unseeded) |
| `/admin` + all admin modules | ✗ (→ /login; API 403) | ✓ all | ✓ all | ✓ (if assigned) |
| Refund completion | ✗ 403 | ✗ 403 | ✓ | ✓ |
| Suspend/reinstate customers | ✗ 403 | ✓ (gap) | ✓ | ✓ |
| Role/permission management | ✗ (no endpoint) | ✗ (no endpoint) | ✗ (no endpoint) | ✗ (no endpoint) |

## 9. Vulnerabilities & Missing Controls

1. **[HIGH] No account-status enforcement.** `POST /auth/login` (`routes/auth.ts:158-192`), `requireAuth` (`middleware/auth.ts:9-52`), and `GET /auth/me` perform no `User.status` check. A `SUSPENDED` or `DELETED` user can log in, establish sessions, and call APIs (including admin APIs if they hold an ops role). Admin suspend (`PATCH /admin/customers/:id`) therefore does not revoke access.
2. **[MEDIUM] Staff over-privilege.** One coarse gate means STAFF == ADMIN everywhere except refund completion: staff can suspend customers (Finding 1's only lever), moderate reviews, manage coupons, adjust inventory, read audit logs and payments. No `users.manage` / `system.settings` separation.
3. **[MEDIUM] Permissions unenforced.** Seeded `Permission`/`RolePermission` rows are decorative; `requireRole`/`hasRequiredPermission` are dead code. Authorization logic is duplicated in four files.
4. **[MEDIUM] No SUPER_ADMIN bootstrap.** Slug is recognized by guards but never seeded; first-admin story is `admin@veyra.local / Admin123!` (dev-only password, must not reach production).
5. **[LOW] Frontend authorization UX.** No `/admin/dashboard` route, no 403 page, customer loop to `/login`, no admin entry point in account navigation, login ignores `?redirect=`. No `middleware.ts` (accepted: backend enforces; UX-only hardening possible).
6. **[LOW] Session hygiene.** No rotation on login, `lastUsedAt` never written, `clearCookie` omits `sameSite/secure` (may fail to clear Secure cookies in some browsers), `SESSION_SECRET` env is defined but unused.
7. **IDOR/BOLA: PASS** for customer resources (owner-scoped + tested in `security.test.ts:134-211`). Admin object access is role-gated, not ownership-gated — intended.
8. **Response sanitization: PASS** — admin customer/order serializers select explicit fields; no password hashes/tokens in responses; error contract `{ success, error: { code, message, details, requestId } }` never leaks internals (tested `security.test.ts:76-86`).
9. **Audit logging: PARTIAL** — catalogue/inventory/returns/coupon/review/customer mutations log; role changes cannot occur (no endpoint); auth successes/failures and suspend actions log only `CUSTOMER_UPDATED` without before/after status.

## 10. Recommended Changes (Implemented in IMPLEMENTATION-REPORT)

1. Enforce `User.status` in login, `requireAuth`, `/auth/me` (ACTIVE-only; 403 `ACCOUNT_SUSPENDED` / `ACCOUNT_DELETED` / `ACCOUNT_INACTIVE`).
2. Centralize role sets + add DB-backed `requirePermission()` with single super_admin wildcard; restrict customer `status` changes to admin+.
3. Seed `super_admin` (all permissions) idempotently; add super_admin-only role-assignment endpoints with audit + self-lockout guard.
4. Frontend: canonical `/admin/dashboard` (redirect from `/admin`), `/admin/unauthorized` 403 page, `?redirect=` login flow, conditional Admin Dashboard link in account nav.
5. Tests for all of the above; docs updates.
