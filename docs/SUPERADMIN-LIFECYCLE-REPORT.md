# Last Super-Admin Lifecycle Protection

Status labels: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / NOT VERIFIED / BLOCKED / FUTURE.
All verdicts below are execution-backed; anything not run is marked NOT VERIFIED.

Closes the residual gap noted in [RBAC-ADMINISTRATION-REPORT.md](RBAC-ADMINISTRATION-REPORT.md)
§7: voluntary `POST /account/deactivate` / `POST /account/delete` could remove the
last usable super-admin. No super-admin account or credential was created, modified, or reset.

## 1. Phase 1 — Audit findings (before editing)

* Endpoints: `POST /account/deactivate` (`apps/api/src/routes/account.ts:209`) →
  `deactivateAccount` (`apps/api/src/lib/account/account.ts:687`);
  `POST /account/delete` (`account.ts:213`) → `requestAccountDeletion`
  (`lib/account/account.ts:697`). Both `{ preHandler: requireAuth, ...authLimit() }`;
  identity comes exclusively from `request.user.id` (session DB record,
  `account.ts:57-61`) — the body is never read, so no client user ID or role can
  steer the operation.
* Lifecycle is soft-only and unchanged by this task: deactivate sets `INACTIVE`,
  delete sets `DELETED + deletedAt`; rows are retained (no hard delete exists via
  API); both revoke all own sessions and write their audit rows
  (`ACCOUNT_DEACTIVATED` / `ACCOUNT_DELETION_REQUESTED`); deactivate additionally
  emits the security event after commit.
* "Usable super-admin" matches existing auth semantics: `status === 'ACTIVE'`
  (`assertUserActive`, `middleware/auth.ts`) plus a `super_admin`/`super-admin`
  grant (`isSuperAdminSlug`, `lib/permissions.ts`) — the same definition the
  role-revoke survivor test uses.
* Gap: neither function checked remaining super-admins, and no test covered these
  endpoints at all (grep over `*.test.ts` found zero references).
* Transaction model: interactive `prisma.$transaction(async (tx) => …)` is the
  repo standard (checkout, google-auth, shopping, …); `Serializable` precedent
  exists (`lib/checkout.ts:329`); no advisory-lock precedent existed.
* Concurrency analysis: a count outside the transaction races; serializable-only
  would abort one contender with `40001` (surfacing as 500 without new error
  mapping). A transaction-held `pg_advisory_xact_lock` serializes the
  check+mutation deterministically (200 + 409) on PostgreSQL — the single
  production database and the local dev database.

## 2. Invariant and concurrency strategy

* Invariant: a usable (ACTIVE + super-admin grant) account is refused with
  `409 LAST_SUPER_ADMIN` when zero other usable super-admins exist. Non-usable
  accounts (any status ≠ ACTIVE, or no grant) take the pre-existing path
  unchanged — customers see byte-identical behavior.
* Mechanism: `lifecycleMutation` fast-paths ordinary accounts (same statements,
  still one transaction, no lock); usable super-admins enter an interactive
  transaction that takes `pg_advisory_xact_lock(829167541)` (xact-scoped,
  auto-released), re-checks standing under the lock (the routing read is
  advisory-only), counts other usable super-admins, and throws before any write
  when none remain. Blocked attempts write nothing: no status change, no session
  revocation, no audit row — matching existing guard behavior
  (`SELF_LOCKOUT_DENIED`, `SUPER_ADMIN_PROTECTED`).
* Error contract preserved: `{ success: false, error: { code, message, …requestId } }`.
* No schema migration (lock, not schema). No seed, prod SQL, or credential changes.

## 3. Files changed

* `apps/api/src/lib/account/account.ts` — guard (`readLifecycleStanding`,
  exported `assertSuperAdminHandover`), `lifecycleMutation` router, rewired
  `deactivateAccount` / `requestAccountDeletion` (same statements, same order,
  same audit/security-event behavior).
* `apps/api/src/routes/account-lifecycle.test.ts` (new) — 13 tests: guard decision
  logic on a stub transaction (4), wiring contract tripwire (1), outcome-driven
  block/handover tests for deactivate + delete with full atomicity assertions,
  customer parity (2), request-field IDOR (1), two-party race with per-account
  atomicity + system invariant (1).

## 4. Regression test commands and actual results

* `npx vitest run apps/api/src/routes/account-lifecycle.test.ts` — **13/13 pass**.
  Isolated-run branch recorder: `deactivate-handover, delete-handover,
  race-applied` (block branches also possible; see §6).
* `npx vitest run` (auth incl. bcrypt, RBAC, admin authz, dashboard): **51/51 pass**.
* `npx vitest run` (smoke + security): **46/46 pass**.
* Full `npx vitest run`: **687/688, 71/72 files**; this file 13/13 within it. Sole
  failure is the known pre-existing `apps/api/src/lib/auth.test.ts` bcrypt 5 s
  timeout under full parallel load (file untouched; 3/3 in isolation).
* `npm run typecheck` — exit 0. API `lint` — 0 errors (one pre-existing
  unused-var warning in untouched `routes/storefront.ts`). `npm run build
  --workspace @veyra/api` — exit 0.
* Fixture hygiene: stamp-scoped cleanup in `afterAll`; no seed run.

## 5. Migration requirements

* **None.** No schema, seed, or data change.

## 6. Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Sole super-admin cannot deactivate (409, state untouched) | VERIFIED (logic) / NOT VERIFIED (live 409) | Stub decision tests (4/4); wiring tripwire; outcome-driven atomicity tests. Live 409 not stageable here: the shared dev DB holds a permanent bootstrap super-admin that must not be touched (see limitations) |
| Sole super-admin cannot delete | Same as above | Same as above |
| Handover deactivate/delete succeed with full lifecycle | VERIFIED | HTTP tests: 200, INACTIVE/DELETED + deletedAt, sessions revoked, audit row, `/auth/me` 401 |
| Customer deactivate/delete unchanged | VERIFIED | HTTP tests incl. response shapes, session revocation, audit parity |
| Client fields cannot redirect the operation | VERIFIED | IDOR test with smuggled `userId`/`role`/`roles`/`status` fields |
| Session revocation intact | VERIFIED | `liveSessions` counts + `/auth/me` transitions on every path |
| Concurrent operations serialize (no zero-admin outcome) | VERIFIED (invariant + atomicity) / NOT VERIFIED (live [200,409] split) | Race test: codes ⊆ {200,409}, per-account atomicity, global ≥1 usable admin; lock is transaction-held PG advisory lock. The [200,409] split itself needs pair sole-hood, unavailable here for the same reason as above |
| Existing auth/RBAC/smoke/security suites | VERIFIED | 51/51 + 46/46 grouped; 687/688 full (sole failure pre-existing bcrypt timeout, 3/3 isolated) |
| Typecheck / lint / API build | VERIFIED | Exits 0 / 0-errors / 0 |

## 7. Unresolved limitations

* Live-409 execution (sole-hood staging) is impossible in this environment without
  touching the pre-existing bootstrap super-admin — forbidden. Covered instead by
  decision-logic proofs + wiring tripwire + atomicity proofs. A fresh CI database
  (no bootstrap super-admin) would execute the block branches; the branch recorder
  (`[account-lifecycle] exercised branches`) reports per-run coverage.
* Concurrent mutual role-revocation (`POST /admin/users/:id/roles` A↔B race) is a
  distinct pre-existing vector outside this task's deactivation/deletion scope;
  same-lock follow-up recommended.
* Production behavior (Render/PostgreSQL) — NOT VERIFIED (no prod access);
  advisory locks are standard PostgreSQL and also verified against the local
  PostgreSQL dev database used by the suite.
