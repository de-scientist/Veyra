# Authentication & RBAC

## Sessions

Cookie-session auth, no JWTs, no client-side tokens. Login/register (`POST /auth/register|/login`, zod-validated, password min 8, rate-limited 10/min) create a server-side `Session` (7-day expiry) and set the `veyra_session` cookie: HttpOnly, SameSite Lax, Secure in production. Every request resolves the session by token hash, rejecting revoked/expired ones. Logout revokes server-side and clears the cookie. Passwords: bcrypt. `PasswordResetToken` / `EmailVerificationToken` models exist; reset/verification flows were not verified — treat as NOT VERIFIED.

## Account Status

Only `ACTIVE` accounts can authenticate. `POST /auth/login`, `GET /auth/me`, and `requireAuth` enforce status via `assertUserActive` (`apps/api/src/middleware/auth.ts`): `SUSPENDED` → 403 `ACCOUNT_SUSPENDED`, `DELETED` → 403 `ACCOUNT_DELETED`, other non-active → 403 `ACCOUNT_INACTIVE`. Suspending a user therefore revokes API access immediately; existing sessions need no separate hunt-down. Role is re-loaded from the database on every request, so role changes also take effect immediately (no stale-privilege window).

## Roles (RBAC)

`User → UserRole → Role(slug)` with `Permission`/`RolePermission` as the data-driven permission store. Seed provisions `customer`, `staff`, `admin`, **`super_admin`** (all seeded permissions granted to `super_admin`) plus the bootstrap `admin@veyra.local` admin. `Role`/`UserRole` constrain duplicates via `@@unique([userId, roleId])`; `RolePermission` via `@@unique([roleId, permissionId])`.

Central catalog: `apps/api/src/lib/permissions.ts` (role sets, canonical permission slugs, DB-backed permission resolution). The `super_admin` wildcard (`['*']`) lives only in `getUserPermissionSlugs` — never inline in routes.

| Gate | Requirement | Location |
|---|---|---|
| Customer account, wishlist, returns | authenticated owner (DB-backed scoping; guest orders via confirmation token) | `requireAuth` + service scoping |
| Operations (admin panel, catalogue, inventory, orders, fulfillment, analytics, audit) | staff, admin, or super_admin | `requireOperationsAccess` |
| Financial completion (`POST /admin/refunds/:id/process`) | admin or super_admin | `requireFinancialAccess` |
| Customer suspend/reinstate (`PATCH /admin/customers/:id` with `status`) | admin or super_admin (name/phone edits remain staff-accessible) | `requireAdminAccess` inside handler |
| Role listing / assignment (`GET /admin/roles`, `POST /admin/users/:id/roles`) | super_admin only, audited (`USER_ROLE_CHANGED`), self-lockout denied | `requireSuperAdmin` |
| Granular permission check (opt-in per endpoint) | DB-resolved `RolePermission` grants | `requirePermission(...)` |

All authorization is server-side. The admin shell's client-side role check is UX-only and documented as such in code. User lifecycle: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `DELETED`; customers can deactivate/delete their account (rate-limited, audited); admins can suspend/reinstate.

## First Super-Admin Bootstrap

No super-admin is created with a default password. Promote an existing user directly in the database, then manage all further grants through `POST /admin/users/:id/roles`:

```sql
-- Run with psql after the user has registered / been created:
INSERT INTO "UserRole" ("id", "userId", "roleId")
SELECT gen_random_uuid(), '<USER_ID>', "id" FROM "Role" WHERE slug = 'super_admin'
ON CONFLICT ("userId", "roleId") DO NOTHING;
```

## Google Sign-In (Customers Only) — IMPLEMENTED

Server-managed OAuth 2.0 / OpenID Connect authorization-code flow with PKCE, terminating in the existing `veyra_session` cookie. Staff/admins keep password auth; Google registration creates `customer`-role accounts only. Full record: [JB-GOOGLE-AUTHENTICATION-IMPLEMENTATION-REPORT.md](JB-GOOGLE-AUTHENTICATION-IMPLEMENTATION-REPORT.md).

- Endpoints (`apps/api/src/routes/google-auth.ts`): `GET /auth/google/status`, `GET /auth/google/start`, `GET /auth/google/callback`, `GET /auth/google/link/status`, `POST /auth/google/link/start`, `POST /auth/google/unlink`.
- Identity keyed by Google stable `sub` (`OAuthAccount`, unique `provider+sub`); email is an attribute. Email match on an unlinked account never auto-links — the callback redirects with `google_error=email_exists` and no session.
- Linking requires an authenticated session bound to a server-side `LINK` transaction plus current-password reauth for password accounts (Account → Security). Unlink requires password reauth and is refused when Google is the only sign-in method (lockout prevention).
- `User.passwordHash` is nullable (Google-only accounts store NULL; login/change-password treat NULL as no-password, never a placeholder). New audit actions `GOOGLE_LINKED` / `GOOGLE_UNLINKED`. Migration: `prisma/migrations/20261012_phase18_google_auth/`.
- Env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (backend-only) / optional `GOOGLE_REDIRECT_URI`; absent credentials fail closed (`GOOGLE_NOT_CONFIGURED`) and the UI hides the Google button.

## Frontend Wiring

Login/register forms POST with `credentials: include`; login honors a validated same-origin `?redirect=` (see `safeRedirectTarget` in `components/AuthForms.tsx`) and otherwise routes to `/account`. Account pages fetch owner-scoped endpoints; the account navigation shows an **Admin Dashboard** entry only when the session carries `dashboard.read` (`can()` in `lib/admin-api.ts`). The admin shell redirects unauthenticated users to `/login?redirect=/admin/...` and authenticated-but-forbidden users to `/admin/unauthorized` (403 page, no internals leaked). See [ADMIN.md](ADMIN.md).

## Related Controls

Rate limiting, security headers, CORS allowlist, HMAC webhook verification, and audit logging are covered in [SECURITY](../SECURITY.md). Full audit trail: [ADMIN-ACCESS-RBAC-AUDIT.md](ADMIN-ACCESS-RBAC-AUDIT.md); remediation record: [ADMIN-RBAC-IMPLEMENTATION-REPORT.md](ADMIN-RBAC-IMPLEMENTATION-REPORT.md).
