# RBAC Administration — Audit, Hardening & Management UI

Status labels: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / NOT VERIFIED / BLOCKED / FUTURE.
All verdicts below are execution-backed; anything not run is marked NOT VERIFIED.

## 1. Phase 1 — Repository audit (read-only, before editing)

### 1.1 Models (`prisma/schema.prisma`) — sound, no migration needed

* `User → UserRole → Role(slug)`, `Role → RolePermission → Permission(slug, resource, action)`.
  Stable IDs (uuid), `@@unique([userId, roleId])` and `@@unique([roleId, permissionId])` prevent
  duplicate grants. `UserStatus`: `ACTIVE, INACTIVE, SUSPENDED, DELETED`.
* `Role` has **no description field** (only `id, name, slug, createdAt`) — the UI therefore
  shows name/slug/counts and permission metadata instead of inventing descriptions.
* `AuditAction` has `USER_ROLE_CHANGED` but **no role/permission-definition members** — see F7.
* Baseline migration contains all tables; seed (`prisma/seed.ts`) provisions `customer, staff,
  admin, super_admin` + 11 permissions granted to `admin`/`super_admin`, a subset of grants to
  `staff`, and bootstrap `admin@veyra.local` (`admin` role only — never `super_admin`).

### 1.2 Backend — endpoint/guard map (full table in §4)

* Only auth-data mutations: `POST /admin/users/:id/roles` (`requireSuperAdmin`, self-lockout
  guard, audited) and `PATCH /admin/customers/:id{status}` (escalated `requireAdminAccess`).
* No role/permission-definition endpoints existed — the Roles page was read-only.
* Registration (`routes/auth.ts`) and Google sign-in (`routes/google-auth.ts`) hardcode the
  `customer` role; no client role input is accepted.
* Session revocation is user-scoped (`findFirst({id, userId})` — no IDOR).
* `requirePermission(...)` is correct but unused by any route; all routes use tier guards.
* Inactive/suspended/deleted users are rejected on every authenticated path (`assertUserActive`).

### 1.3 Frontend — mostly complete, mutations missing

* Nav (`lib/admin-nav.ts`): Users + Roles present, `superAdminOnly`, UX-only with backend
  re-authorization. Patterns established: `useConfirm`/`JBConfirmDialog`, `useToast`,
  `AdminEmptyState`, `AdminPagination`, theme tokens, `Route`-typed hrefs.
* Users list + detail (assign/revoke with confirmation) existed; Roles page was a read-only
  matrix; no create/edit/grant UI existed.

### 1.4 Audit table

| # | Finding | File / location | Impact | Fix | Risk | Test |
|---|---|---|---|---|---|---|
| F1 | No role/permission-definition endpoints; Roles UI read-only | `routes/admin.ts` (roles GET only), `app/admin/roles/page.tsx` | RBAC unmanageable without DB access | Super-admin-only CRUD + grant endpoints + UI | Medium (new surface, all guarded) | `admin-roles.test.ts`, `admin-roles.test.ts` (web) |
| F2 | Last super-admin removable in theory | `routes/admin.ts` roles POST | Unmanageable system | Proven safe by construction (self-revoke denied; every revoke leaves its actor holding the grant) + documented; dead-code query rejected | None | Invariant test (survivor keeps grant) |
| F3 | `admin` could suspend a super-admin's customer account | `routes/admin.ts` customers PATCH | Admin affects super-admin availability | Require super-admin actor for super-admin targets (`SUPER_ADMIN_PROTECTED`) | Low | `admin-roles.test.ts` |
| F4 | `requireRole(req, role, reply)` unusable as `preHandler`; unused | `middleware/auth.ts` | Future-misuse trap | Factory `requireRole(role)` mirroring `requirePermission` | Low (was unused) | Probe-route test |
| F5 | `hasRequiredPermission` ignores DB grants; request paths don't use it | `lib/auth.ts` | Confusion only | Documented legacy/test-only; not wired into any path | None | Existing `auth.test.ts` kept |
| F6 | `requireAdminAccess` identical to `requireFinancialAccess` | `middleware/auth.ts` | No distinct admin tier; confusing | Documented; behavior preserved | None | — |
| F7 | No `AuditAction` for role/permission-definition changes | `schema.prisma` enum | New definition mutations can't be audit-logged without enum migration | Gap documented; user-role changes keep `USER_ROLE_CHANGED` | None (no migration) | — |
| F8 | Seeded Permission rows ⊂ code catalogue; no route enforces `requirePermission` yet | `seed.ts` vs `lib/permissions.ts` | Latent only, no live hole | Documented matrix; no silent grants; not wired into routes in this task | None | — |
| F9 | Self status change via directory (self-suspend lockout) | `routes/admin.ts` customers PATCH | Self-lockout | `SELF_LOCKOUT_DENIED` for own status changes | Low | `admin-roles.test.ts` |
| F10 | Verified safe, unchanged: register/google customer-only, session scoping, delivery-assignee validation, media context gate | `auth.ts`, `google-auth.ts`, `account.ts`, `fulfillment.ts`, `media.ts` | None | None | — | Existing suites |

## 2. Implemented fixes and files changed

### Backend (`apps/api`)

* `src/routes/admin.ts`
  * `GET /admin/permissions` (super-admin): every permission with `name/slug/resource/action/roles`.
  * `POST /admin/roles` (super-admin): create custom roles; lowercase `slug` validated
    (`^[a-z0-9]+([-_][a-z0-9]+)*$`, ≤60), name 2–80, reserved slugs rejected (`ROLE_RESERVED`).
  * `PATCH /admin/roles/:id` (super-admin): rename custom roles only; slug immutable;
    canonical roles rejected (`ROLE_PROTECTED`).
  * `DELETE /admin/roles/:id` (super-admin): custom roles only, must be empty
    (`ROLE_NOT_EMPTY`); grants removed first.
  * `POST /admin/roles/:id/permissions` + `DELETE /admin/roles/:roleId/permissions/:slug`
    (super-admin): grant/revoke with `PERMISSION_NOT_FOUND` / `PERMISSION_ALREADY_GRANTED` /
    `PERMISSION_NOT_GRANTED`; the `super_admin` grant set is fixed by code (`ROLE_PROTECTED`).
  * `POST /admin/users/:id/roles`: unchanged behavior (self-lockout guard retained) + documented
    last-super-admin safety proof (see §3).
  * `PATCH /admin/customers/:id`: `SELF_LOCKOUT_DENIED` for own status changes;
    `SUPER_ADMIN_PROTECTED` when a non-super-admin targets a super-admin account.
* `src/middleware/auth.ts`: `requireRole` converted to a `preHandler` factory (was an unwirable
  `(request, role, reply)` signature; no route used it).

### Frontend (`apps/web`)

* `lib/admin-api.ts`: `AdminPermission`, `SYSTEM_ROLE_SLUGS`/`isSystemRole`, and six client
  functions (`getAdminPermissions`, `createAdminRole`, `updateAdminRole`, `deleteAdminRole`,
  `grantRolePermission`, `revokeRolePermission`) over `credentials: 'include'`.
* `app/admin/roles/page.tsx`: overview — protected badges, member/permission counts, create
  form, confirmed delete, detail links; super-admin gate retained.
* `app/admin/roles/[id]/page.tsx` (new): detail — rename (custom), permissions grouped by
  `resource` with readable names, confirmed grant/revoke with scope messaging, delete section.
* Nav needed no change (Roles/Users already `superAdminOnly`).

## 3. Role/permission matrix (as shipped)

| Capability | customer | staff | admin | super_admin |
|---|---|---|---|---|
| Storefront / own account data | YES | YES | YES | YES |
| Operations area (`/admin/*` reads + catalogue/inventory/orders/fulfillment/analytics) | NO (403) | YES (explicit ops membership) | YES | YES |
| Financial completion (`refunds/process`, manual verify) | NO | NO | YES | YES |
| Customer suspend/reinstate | NO | NO | YES (non-super-admin targets) | YES |
| User-role assignment | NO | NO | NO (403) | YES (audited, self-lockout denied) |
| Role/permission definitions | NO | NO | NO (403) | YES (canonical roles + super-admin grants immutable) |
| Effective permissions source | — | `RolePermission` rows | `RolePermission` rows | Code wildcard `['*']` (`getUserPermissionSlugs` only) |

Last-super-admin safety (F2): revoking a super-admin grant requires a super-admin actor, and
self-revocation returns `403 SELF_LOCKOUT_DENIED` — therefore every successful revoke leaves its
actor holding the grant, and the final usable super-admin cannot be removed through this endpoint.
Suspending/deactivating the last super-admin through other paths requires either super-admin
actor (directory, F3-guarded) or is voluntary self-service (account deactivate/delete, out of scope).

## 4. API authorization coverage (post-change deltas only; full map audited in §1.2)

| Endpoint | Guard | Notes |
|---|---|---|
| `GET /admin/permissions` | `requireSuperAdmin` | New read; no PII beyond slugs |
| `POST /admin/roles` | `requireSuperAdmin` | Reserved-slug + shape validation; audit gap F7 documented |
| `PATCH /admin/roles/:id` | `requireSuperAdmin` | Name only; canonical rejected |
| `DELETE /admin/roles/:id` | `requireSuperAdmin` | Empty custom only |
| `POST /admin/roles/:id/permissions` | `requireSuperAdmin` | Grant; super_admin role rejected |
| `DELETE /admin/roles/:roleId/permissions/:slug` | `requireSuperAdmin` | Revoke; super_admin role rejected |
| `POST /admin/users/:id/roles` | `requireSuperAdmin` (unchanged) | + documented invariant |
| `PATCH /admin/customers/:id` | `requireOperationsAccess` + `requireAdminAccess` for `status` (unchanged) | + `SELF_LOCKOUT_DENIED` (self) / `SUPER_ADMIN_PROTECTED` (super-admin target) |
| All other routes | Unchanged | Full pre-change map verified; no guard weakened |

## 5. Test commands and actual results

* `npx vitest run apps/api/src/routes/admin-roles.test.ts` — **10/10 pass** (401/403 matrix,
  no-mutation snapshot, custom-role lifecycle incl. 409/404 edges, system-role protection,
  survivor invariant, self-status + super-admin-target guards, registration smuggling,
  union-vs-wildcard resolution, `requireRole` probe).
* `npx vitest run apps/web/lib/admin-roles.test.ts` — **4/4 pass** (gates, create/delete,
  grant/revoke flows, client coverage).
* Regression: `rbac.test.ts` + `admin-customers-authz.test.ts` 30/30; `admin-users.test.ts`,
  `smoke.test.ts`, `security.test.ts` pass; `admin-dashboard-customers.test.ts` pass (global
  metrics re-asserted via deterministic stamp-scoped + structural checks after a parallel-run
  flake was fixed the same way).
* Full `npx vitest run`: 70/71 files, 672+ pass; sole failure is pre-existing
  `apps/api/src/lib/auth.test.ts` "hashes and verifies passwords" — bcrypt 5 s timeout under
  full parallel load. File untouched by this task; passes in isolation (verified in a 17/17
  grouped run). Recorded as environment flake, NOT VERIFIED under full parallelism.
* `npm run typecheck` — exit 0. `npm run lint` — 0 errors (one pre-existing unused-var warning
  in untouched `routes/storefront.ts`; pre-existing `<img>` warnings on web).
* `npm run build --workspace @veyra/api` — exit 0. `npm run build --workspace @veyra/web` —
  exit 0 (`/admin/roles` + `/admin/roles/[id]` prerender; one transient ECONNREFUSED on first
  attempt, green on retry).
* Fixture hygiene: stamp-scoped users/roles/permissions removed in `afterAll`; verified
  zero leftover rows from earlier suites; no seed script run.

## 6. Migration / seed requirements

* **None.** No schema change (F7 gap accepted and documented instead of an enum migration;
  `Role` description omitted per §1.1). No seed run performed; no super-admin created or altered.

## 7. Remaining risks — NOT VERIFIED / FUTURE

* Production authorization behavior (live roles/grants on Render) — NOT VERIFIED (no prod access).
* `requirePermission(...)` per-endpoint wiring — FUTURE (deliberately not wired here to avoid
  behavior change; F8).
* Audit rows for role/permission-definition mutations — BLOCKED on an `AuditAction` enum
  migration (forward-only SQL + review); user-role changes remain fully audited.
* Full-suite `auth.test.ts` bcrypt timeout under maximum parallelism — pre-existing flake,
  unrelated file, passes in isolation.
