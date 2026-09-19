# Authentication & RBAC

## Sessions

Cookie-session auth, no JWTs, no client-side tokens. Login/register (`POST /auth/register|/login`, zod-validated, password min 8, rate-limited 10/min) create a server-side `Session` (7-day expiry) and set the `veyra_session` cookie: HttpOnly, SameSite Lax, Secure in production. Every request resolves the session by token hash, rejecting revoked/expired ones. Logout revokes server-side and clears the cookie. Passwords: bcrypt. `PasswordResetToken` / `EmailVerificationToken` models exist; reset/verification flows were not verified — treat as NOT VERIFIED.

## Roles (RBAC)

`UserRoleName`: `CUSTOMER`, `STAFF`, `ADMIN`, `SUPER_ADMIN` (seed provisions customer/staff/admin + permission set + bootstrap admin). `Role`/`Permission`/`UserRole`/`RolePermission` are data-driven (e.g. `orders.manage`, `fulfillment.process`).

| Gate | Requirement |
|---|---|
| Customer account, wishlist, returns | authenticated owner (DB-backed scoping; guest orders via confirmation token) |
| Operations (admin panel, catalogue, inventory, orders, fulfillment, analytics, audit) | `requireOperationsAccess`: staff, admin, or super_admin |
| Financial completion (`POST /admin/refunds/:id/process`) | `requireFinancialAccess`: admin or super_admin |

All authorization is server-side. The admin shell's client-side role check is UX-only and documented as such in code. User lifecycle: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `DELETED`; customers can deactivate/delete their account (rate-limited, audited); admins can suspend/reinstate.

## Frontend Wiring

Login/register forms POST with `credentials: include` and route to `/account`. Account pages fetch owner-scoped endpoints; admin shell redirects non-operations users to `/login`. See [ADMIN.md](ADMIN.md).

## Related Controls

Rate limiting, security headers, CORS allowlist, HMAC webhook verification, and audit logging are covered in [SECURITY](../SECURITY.md).
