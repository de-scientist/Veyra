# Phase H Report — Admin & Operations Platform UX, CRUD & Operational Control

## 1. Executive Summary

Phase H completes the JB Mercantile Admin & Operations Platform. The audit
found a broad, real implementation (~25 admin pages on live APIs), so this
phase closes the sharp gaps instead of rebuilding: a new super-admin **Users
directory + detail + Roles matrix** (the only new backend surface: two
read-only `requireSuperAdmin` endpoints), **permission-aware navigation**
(Users/Roles hidden from non-super-admins), and an operations polish batch —
reviews/coupons search + status filters, customer name/phone editing,
orders fulfillment-status deep-linking, confirmed variant archive/restore,
expandable audit diffs, notification badges/dates, operator-owned return
reject reasons + per-line inspection decisions, a read-only reservations
view, and formatted settlement figures. Zero fake CRUD, zero mock data, zero
second RBAC/auth/media systems. Backend remains the sole authority on every
operation.

**Status: PASS** (API typecheck/build blocked by the same pre-existing,
out-of-scope `reservations.ts` error documented in Phases F/G; untouched by
Phase H — every Phase H surface verifies green.)

## 2. Initial Admin Audit

Dual read-only audits (frontend routes/shell/client/pages/primitives/
hygiene; backend guards/permissions/capability-matrix/audit/rate-limits/
IDOR scoping) plus verification of Phases A–G reports against live source:

- Frontend: 36 admin `page.tsx` (dashboard, products ×3, categories,
  collections, attributes, inventory ×2, orders ×2, payments, fulfillment,
  returns, notifications, customers ×2, reviews, coupons, 12 analytics,
  audit-logs, settings, unauthorized). All real API data; zero
  `window.alert/confirm/prompt`, zero `href="#"`, zero emoji icons.
- Backend: every `/admin/*` route guarded (`requireOperationsAccess`
  default; `requireFinancialAccess` only for refund completion;
  `requireSuperAdmin` only for roles/user-roles). Fine-grained
  `requirePermission()` exists but has no call sites — routes use coarse
  role guards (documented, not changed).
- Ranked gaps closed: missing Users/Roles UI, static nav, hard-coded
  return decisions, unwired search states, read-only-by-omission customer
  edit, hidden audit diffs, raw notification/settings rendering, no
  reservation visibility. Correctly-read-only surfaces (order detail
  transitions, payments, settings PATCH) were **documented, not faked**.

## 3. Admin Access Architecture

```text
Login → veyra_session cookie → GET /auth/me (AdminShell gate) →
isOperationsRole → shell + filtered nav → per-page super-admin gates
where needed → admin-api (credentials:include) → backend preHandler
guard (Operations / Financial / SuperAdmin) → service → PostgreSQL
```

- Shell gate is UX-only (commented as such); every endpoint re-authorizes.
- Suspended/deleted sessions rejected centrally (`assertUserActive`);
  unauthenticated → `/login?redirect=`; forbidden → `/admin/unauthorized`
  (renders gateless to avoid loops).
- New: super-admin pages (`/admin/users`, `/admin/users/[id]`,
  `/admin/roles`) add a page-level `isSuperAdminRole` check with the same
  redirect target — backend `requireSuperAdmin` stays authoritative.
- Admin layout metadata: `robots index:false follow:false` (noindex
  correct); backend remains mandatory (robots.txt is not security).

## 4. RBAC Implementation

Preserved verbatim — no second system:

- Model: `User → UserRole → Role → RolePermission → Permission`
  (`SUPER_ADMIN_SLUGS`, `OPERATIONS_ROLE_SLUGS`, `FINANCIAL_ROLE_SLUGS`;
  case-insensitive; `super_admin` wildcard `['*']` only).
- Tiers: CUSTOMER (no admin), STAFF (operations, **not** financial/admin),
  ADMIN (operations + financial + customer lifecycle), SUPER_ADMIN (roles).
- Frontend `can()` (UX-only) + `isOperationsRole`/`isSuperAdminRole`
  (newly exported) drive nav/page visibility; backend guards decide.
- No permission expanded for UI convenience; no role invented.

## 5. Navigation Structure

`AdminShell` NAVIGATION (19 entries): Dashboard, Analytics, Orders,
Payments, Fulfillment, Products, Categories, Collections, Attributes,
Inventory, Returns, Customers, Reviews, Coupons, Notifications, Audit
Logs, Settings (all operations) + **Users, Roles (super-admin only,
filtered via `isSuperAdminRole`)**. Active matching, `aria-current`,
JBIcon set, role badge, mobile drawer (trap/Escape/scroll-lock/restore),
confirmed logout. No topbar/breadcrumbs added (detail pages keep Back
links — consistent existing pattern, not a gap).

## 6. Dashboard

Unchanged (already real): live KPI cards with deep-links into filtered
queues, loading/error/empty states. No fake metrics; no auto-refresh
(documented limitation).

## 7. Product Management

List (search/status/category/pagination) + create + detail edit (status
incl. ARCHIVED) + variant price/status/create + full Phase D media manager.
Change: variant **Archive/Restore now uses `ConfirmAction`** (was
one-click). Commerce-safe: archive-via-status, never hard delete; no bulk
ops (no backend support — documented, not faked).

## 8. Category Management

Unchanged (already complete): inline create/edit, dependency-guarded
archive (409 on products/live children), toasts + confirms, empty/loading/
error states. Archive semantics labelled honestly.

## 9. Collection Management

Unchanged (already complete): same guarded pattern as categories.
Product-membership editing has no backend endpoint — count-only display
documented as the boundary (no fake attach/detach UI).

## 10. Attribute Management

Unchanged (already the most complete domain): rename, value chips,
in-use-guarded deletes, immutable slugs. Type shown read-only (no backend
type-change path — documented).

## 11. Variant Management

Flexible attribute model preserved (no size/color hard-coding; duplicate/
SKU conflicts rejected backend-side with 409s). Change: archive/restore
confirmations (§7). No variant DELETE endpoint exists — archive is the
safe semantic (documented).

## 12. Media Management

Phase D manager reused untouched (upload/progress/primary/reorder/
alt-text/replace/confirmed delete, `providerCleanup` reported). No second
uploader created.

## 13. Inventory

- Table (SKU/product/on-hand/reserved/**available = onHand − reserved**,
  threshold-derived LOW_STOCK/OUT_OF_STOCK badges), restock/adjust with
  mandatory ≥3-char reasons (every change writes a movement), low/out
  filters, search, pagination, movement-history trail.
- **New: Active Reservations section** (previously API-only
  `getInventoryReservations`): order link, SKU, quantity, status badge,
  created/expiry, status filter. Read-only by policy — no manual
  convert/release endpoint exists (documented, not built).
- Variant picker limited to loaded rows + no threshold-only edit:
  documented boundaries (threshold editable via restock payload only).

## 14. Orders

List (status/payment/fulfillment triple filters + search + pagination;
dashboard deep-links). **Fix: `fulfillmentStatus` now seeds from URL**
(status/payment already did). Detail is a read-only 360° view
(customer/items/financials/payments/deliveries/returns/refunds/timeline) —
**no order state-transition endpoint exists in the backend**, so no
actions were fabricated; fulfillment/returns queues own the transitions.

## 15. Payments

Read-only list + status filter + pagination (correct per M-Pesa rules).
No mark-paid/void/retry UI (no backend support — documented). Sensitive
payloads never rendered; completion stays behind `requireFinancialAccess`.

## 16. Fulfillment

Queue (start/pick/pack/assign/delivery-status) preserved on real
endpoints; legality enforced in `lib/fulfillment.ts`. No ship/deliver
shortcut invented. Uses `shopping-api` client (session/cookie identical —
documented layering note, not a defect).

## 17. Customers

List (search/status/pagination) + detail (profile/addresses/orders/
returns) + audited suspend/reinstate (admin-gated in-handler).
**New: name/phone editing** via the staff-allowed PATCH path (validated,
audited). No create/delete transitions exist (documented). Detail route
reads any user ID — backend-known scoping note (§28).

## 18. Returns

Queue preserved; **operator agency restored**: rejection requires a
written ≥10-char reason + destructive confirmation (was hard-coded text,
one click); inspection records **per-line condition + disposition selects**
(was hard-coded LIKE_NEW/RESTOCK); refund request requires financial
confirmation. Backend state machine stays authoritative; illegal steps
surface server messages.

## 19. Exchanges

No dedicated exchange-fulfillment endpoint exists; exchange data surfaces
through return/order serializers. No workflow fabricated (documented).

## 20. Refunds

Request (operations) vs process (financial-only) split preserved and now
explained in-confirmation. No standalone refunds page (no backend
refund-list endpoint — queue + order detail cover the flow). Every step
audited server-side; idempotency server-owned.

## 21. Coupons

**Fixes: search box + ACTIVE/INACTIVE status filter wired** (backend
already supported both). Create (code/type/value/maxUses) + confirmed
activate/deactivate preserved. No DELETE endpoint (documented); update
limited to status/maxUses/validUntil per backend contract.

## 22. Reviews

**Fix: search input wired** (state existed, no form). Status chips,
confirmed approve/reject (audited), verified-purchase + product/customer
context preserved. No delete/reply endpoints (documented).

## 23. Notifications

Queue (status filter, run-worker, resend) preserved; **rendering fixed**:
`AdminStatusBadge` + `formatAdminDate` (was raw text/dates). Local fetch
client retained (same session semantics); no pagination on the endpoint
(documented boundary); no template editing (no backend support).

## 24. Analytics

Untouched (already complete): 12 pages, Nairobi half-open ranges, presets
+ custom + compare, accessible SVG charts + tabular summaries, per-section
retry, CSV export (capped 5000, rate-limited, audited), definitions page.
Real data only.

## 25. Audit Logs

Search + entity/action filters + pagination preserved (append-only; no
edit/delete/purge UI — correct). **New: expandable per-row before/after
JSON diff** (data was already fetched but hidden). Free-text filters kept
(backend matches on exact action string; documented).

## 26. User Management

**New (the P1 gap):** `/admin/users` — search, status chips, role filter,
paginated table (email/name/roles/status/joined), deep-link to detail.
`/admin/users/[id]` — account facts + full role matrix with confirmed
assign/revoke, toast feedback, self-lockout explained (backend 403
`SELF_LOCKOUT_DENIED` surfaces honestly). Backend: two new read-only
`requireSuperAdmin` endpoints (`GET /admin/users`, `GET /admin/users/:id`),
data-minimized (no hashes/tokens), audited assignment path reused
(`USER_ROLE_CHANGED`). No user create/delete/suspend here (no backend
support — customer lifecycle owns suspension).

## 27. Role Management

**New:** `/admin/roles` — role table (name/slug/member count/permission
slugs), links to user administration. Read-only: roles/permissions are
seeded platform concepts (no backend role-CRUD — documented, not built).
Dangerous actions live on the user page behind explicit confirmations.

## 28. Security

- customer/staff/admin → 403 on super-admin routes; unauth → 401 (new
  `admin-users.test.ts`, 4 tests).
- Existing `rbac.test.ts` (20) + `security.test.ts` green: customer 403
  across `/admin/*`, staff≠financial, self-lockout, unknown-role 404,
  deleted-account 409, role-injection ignored (allowlist slugs only).
- IDOR/BOLA posture verified by audit: product-media re-verifies
  ownership per mutation; account surfaces scope by `userId`/token;
  admin reads are intentionally store-wide for operations (single-store
  design). Known note: `GET /admin/customers/:id` lacks the list's
  customer-role filter (data-minimized; backend-known, unchanged).
- Session: suspend/revoke/expiry enforced centrally; permissions
  re-resolved per request (no stale privilege — stated in UI).
- Rate limits: global 100/window + sensitive/auth overlays on
  financial/export/notification paths (unchanged).
- No secrets in admin UI (settings read-only, safe subset; grep-clean).

## 29. Accessibility

Target WCAG 2.2 AA principles: native buttons/inputs/selects with labels
on every new control; `role=group` filter sets; `aria-label` search
boxes; `alert` errors / `status` successes; `alertdialog` confirms with
trap/Escape/restore; table semantics with `admin-table-wrapper` scroll
regions; text+color badges; `details/summary` keyboard-native audit diffs;
visible focus tokens; reduced-motion global rule. No emoji icons; no
browser dialogs (grep-verified).

## 30. Responsive UX

Existing `account-nav` drawer + `admin-table-wrapper` horizontal scroll +
card layouts reused; new tables/cards follow the same wrappers. Returns
inspect `form-grid` collapses per existing rules. Live device QA
(320–1920) not executable here — static review + pre-release pass
recommended (§36).

## 31. CRUD Matrix

| Domain | Create | Read | Update | Delete/Archive | Backend | UI | Permission | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Products | PASS | PASS | PASS | PASS (archive) | Ops | PASS | PASS | PASS |
| Variants | PASS | PASS | PASS | PASS (archive) | Ops | PASS | PASS | PASS |
| Product Media | PASS | PASS | PASS | PASS | Ops | PASS | PASS | PASS |
| Categories | PASS | PASS | PASS | PASS (guarded archive) | Ops | PASS | PASS | PASS |
| Collections | PASS | PASS | PASS | PASS (archive+unlink) | Ops | PASS | PASS | PASS |
| Attributes | PASS | PASS | PASS | PASS (guarded) | Ops | PASS | PASS | PASS |
| Inventory | PASS (restock) | PASS | PASS (adjust) | NOT APPLICABLE (movements append-only) | Ops | PASS | PASS | PASS |
| Reservations | NOT APPLICABLE | PASS (new UI) | NOT APPLICABLE | NOT APPLICABLE | Ops | PASS | PASS | NOT VERIFIED (read-only view) |
| Orders | NOT APPLICABLE | PASS | PARTIAL (no transition endpoint) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Payments | NOT APPLICABLE | PASS | NOT APPLICABLE (read-only) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Fulfillment | NOT APPLICABLE | PASS | PASS (transitions) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Customers | NOT IMPLEMENTED | PASS | PASS (+new PII edit) | PASS (suspend) | Ops/Admin | PASS | PASS | PASS |
| Coupons | PASS | PASS | PASS (bounded) | NOT IMPLEMENTED | Ops | PASS | PASS | PASS |
| Reviews | NOT APPLICABLE | PASS (+new search) | PASS (moderate) | NOT IMPLEMENTED | Ops | PASS | PASS | PASS |
| Returns | NOT APPLICABLE | PASS | PASS (machine) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Exchanges | NOT APPLICABLE | PARTIAL (via serializers) | NOT IMPLEMENTED | NOT APPLICABLE | — | PARTIAL | PASS | NOT VERIFIED |
| Refunds | NOT APPLICABLE | PASS | PASS (request Ops / process Financial) | NOT APPLICABLE | Ops/Fin | PASS | PASS | PASS |
| Notifications | NOT APPLICABLE | PASS | PASS (process/resend) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Analytics | NOT APPLICABLE | PASS | NOT APPLICABLE | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Audit Logs | NOT APPLICABLE | PASS (+new diffs) | NOT APPLICABLE (append-only) | NOT APPLICABLE | Ops | PASS | PASS | PASS |
| Users | NOT IMPLEMENTED | PASS (new) | PASS (roles only, new) | NOT IMPLEMENTED | SuperAdmin | PASS | PASS | PASS (new) |
| Roles | NOT IMPLEMENTED | PASS (new matrix) | NOT IMPLEMENTED (seeded) | NOT IMPLEMENTED | SuperAdmin | PASS | PASS | PASS |
| Settings | NOT APPLICABLE | PASS | NOT IMPLEMENTED (read-only) | NOT APPLICABLE | Ops | PASS | PASS | NOT VERIFIED |

## 32. Tests

- New `apps/api/src/routes/admin-users.test.ts` (4): 401, role-tier 403
  matrix (customer/staff/admin denied), list+roles+search with
  secret-absence assertions, detail + 404.
- Pre-existing suites all green: RBAC (20, incl. assign/revoke audit +
  self-lockout), security, catalogue, product-media, storefront,
  account/avatar, smoke, web unit.
- Full `npm test`: **26 files / 203 tests — all pass.**
- Browser/AT/device QA: NOT RUN (no harness) — code-reviewed against
  existing primitives; pre-release manual pass recommended.

## 33. Commands Executed

| Command | Result | Note |
| --- | --- | --- |
| `npm run typecheck --workspace @veyra/web` | PASS | clean, incl. all new/edited admin files |
| `npm run typecheck --workspace @veyra/api` | FAIL (pre-existing) | `reservations.ts(50)` error at `origin/main`; new `admin.ts` endpoints compile clean |
| `npm run lint` (api + web) | PASS | 0 errors; pre-existing warnings only |
| `npm test` | PASS | 26 files / 203 tests, all green |
| `npm run build --workspace @veyra/web` | PASS | all routes incl. users/roles pages |
| `npm run build --workspace @veyra/api` | FAIL (pre-existing) | same `reservations.ts` error; out of scope |
| E2E / SR walk-through | NOT RUN | no tooling; not claimed |

## 34. Files Changed

- `apps/api/src/routes/admin.ts` — `GET /admin/users`, `GET
  /admin/users/:id` (super-admin, data-minimized, audited assignment path
  reused).
- `apps/api/src/routes/admin-users.test.ts` (new, 4 tests).
- `apps/web/lib/admin-api.ts` — exported `isSuperAdminRole`; users/roles
  client (`AdminUser/Detail/Role`, list/detail/assign/revoke/roles).
- `apps/web/app/admin/AdminShell.tsx` — permission-aware nav (+Users,
  +Roles super-admin-only).
- `apps/web/app/admin/users/page.tsx`, `users/[id]/page.tsx`,
  `roles/page.tsx` (new, super-admin gated).
- `reviews/page.tsx` (search), `coupons/page.tsx` (search+status),
  `customers/[id]/page.tsx` (PII edit), `orders/page.tsx`
  (fulfillmentStatus URL seed), `products/[id]/page.tsx` (variant
  ConfirmAction), `audit-logs/page.tsx` (before/after diffs),
  `inventory/page.tsx` (reservations view), `settings/page.tsx`
  (money/badges).
- `components/ReturnsQueueClient.tsx` (owned reject reasons + per-line
  inspection + financial/destructive confirms),
  `components/NotificationsQueueClient.tsx` (badges/dates).
- `docs/PHASE-H-REPORT.md` — this report.

## 35. Known Limitations

- Order detail has no state-transition actions (no backend endpoint).
- No user create/delete; no role/permission CRUD (seeded concepts).
- No collection membership editor; no variant DELETE; no coupon DELETE;
  no review delete/reply; no notification pagination/templates; settings
  read-only; analytics CSV-only (5000 cap).
- `requirePermission()` fine-grained helper remains unused (routes use
  role guards — architectural note, not a defect).
- Returns/fulfillment queues use `shopping-api` client (same session
  semantics; layering note).
- Browser/AT/device QA deferred to pre-release manual pass.

## 36. Remaining Gaps

- Pre-existing API `typecheck`/`build` failure (`reservations.ts`) still
  blocks fully-green root commands; unrelated to admin work.
- `GET /admin/customers/:id` role-filter asymmetry (backend-known §28).
- Live admin walk-through with staff/admin/super-admin accounts on
  staging recommended before operations handover.
- Export scope (audit/notifications CSV) only if operations requests it
  and backend support is added first.

## 37. Final Status

```text
Acceptance (§121): access — /admin protected, tier denials enforced
backend-side, super-admin paths tested ✓; dashboard — real metrics,
loading/error/empty ✓; catalogue — full CRUD-safe management ✓;
inventory — derived availability, serviced adjustments, movements,
low-stock, reservations ✓; orders — searchable/filterable detail with
honest read-only boundaries ✓; payments — visible, protected, financial
actions permission-split + audited ✓; fulfillment/delivery — visible +
transitioning ✓; customers — list/detail/edit/suspend with audit ✓;
system — users/roles super-admin-only with self-lockout guards, audit
log viewer with diffs ✓; UX — responsive wrappers, accessible controls,
themes via tokens, no browser dialogs, no emoji, no fake CRUD ✓;
security — IDOR/BOLA/escalation/session/financial cases tested ✓;
verification — web typecheck/lint/tests(203)/build green, API red only
pre-existing, report produced ✓.

PHASE H STATUS: COMPLETE — PASS (with the documented pre-existing,
out-of-scope API typecheck/build failure)
```
