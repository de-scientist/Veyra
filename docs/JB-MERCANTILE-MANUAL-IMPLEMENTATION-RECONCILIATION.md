# JB Mercantile Manual-to-Implementation Reconciliation

Date: 2026-10-07. Method: source inspection of the repository at the current
tree plus full test-suite execution. No live browser E2E was available; no
production data was touched; no code was changed in this phase (see §21 for
why). Status labels: VERIFIED / CODE-VERIFIED / PARTIALLY VERIFIED /
NOT VERIFIED / NOT IMPLEMENTED / BUSINESS DECISION REQUIRED (manual
language); DECIDED / IMPLEMENTATION-DEFINED / REQUIRES BUSINESS DECISION /
DEFERRED (decision register `docs/BUSINESS-DECISIONS.md`).

## 1. Executive Summary

All six frontend/backend discrepancies from the prior audit
(`JB-MERCANTILE-ADMIN-MANUAL-AUDIT.md` §10) were re-investigated against the
current tree. Result: **none is an open software defect**. One (category-code
dead end) was already fixed in the UI after the audit and only the manual
lagged behind; one (edit-page publish bypass) never existed at the backend
layer — enforcement is transactional and path-independent, with regression
tests; the remaining four are audit misreadings or intentional,
documented behaviour. Pricing, SKU, coupon, analytics, notification,
review, and super-admin provisioning were each traced end-to-end; the
manual's honest limitations were kept and sharpened (notably: coupon
redemption and customer review submission are NOT IMPLEMENTED, not
"partial"). Deliverables: this report, `docs/BUSINESS-DECISIONS.md`
(BD-001–BD-012), and manual v1.1. Verification: typecheck PASS (api+web),
lint PASS (0 errors; pre-existing warnings only), tests 486/486 PASS
(484 in full-suite run + 2 flaky 5s-timeouts in `commerce.test.ts` that
pass in isolation — see §24). Builds: PASS (api tsc emit + web `next build`,
60/60 routes; pre-render API fetches ECONNREFUSED without a running API —
environmental). Browser/E2E: NOT VERIFIED (no tooling).

## 2. Documents Reviewed

- `docs/JB-MERCANTILE-ADMIN-USER-MANUAL.md` v1.0 (full read, 1182 lines).
- `docs/JB-MERCANTILE-ADMIN-MANUAL-AUDIT.md` (full read, 212 lines).
- `docs/ADMIN.md`, `docs/AUTHENTICATION.md`, `docs/CATALOGUE.md`,
  `docs/INVENTORY.md`, `docs/CLOUDINARY.md`, `docs/TROUBLESHOOTING.md`,
  `docs/PRODUCT-CREATION-API-FIX-REPORT.md`,
  `docs/PRODUCT-UI-ROUTE-FIX-REPORT.md`, `docs/PHASE-E-FINAL-QA-REPORT.md`.
- `README.md`, `AGENTS.md` (working rules observed throughout).
- Root `BUSINESS-DECISIONS.md` (exists; covers launch/production gates —
  left untouched; catalogue rules now live in `docs/BUSINESS-DECISIONS.md`).

`docs/BUSINESS-DECISIONS.md` and `docs/decisions/` did not exist before this
phase (verified by directory listing); the former is created here, no
`docs/decisions/` records were justified.

## 3. Repository Areas Reviewed

- `apps/api/src/routes/catalogue.ts` (1192 lines: product CRUD, draft
  autosave, publish gate, variant generate/manual/batch, barcode,
  inventory, taxonomy CRUD), `routes/admin.ts` (dashboard, orders,
  payments-manual, customers, reviews, coupons, users/roles),
  `routes/product-media.ts` + `routes/media.ts`, `routes/analytics.ts`,
  `routes/notifications.ts`, `routes/auth.ts`, `routes/shopping.ts`,
  `routes/checkout.ts`.
- `apps/api/src/lib/`: `catalog.ts` (`checkPublishReadiness`,
  `validateCatalogProduct`), `variant-generation.ts` (planner),
  `variant-generation-service.ts` (persistence), `sku.ts`, `barcode.ts`,
  `permissions.ts`, `storefront.ts`, `shopping.ts`, `checkout.ts`,
  `media/products.ts`, `notifications/` (events, worker, orchestrator,
  service, retry, webhooks, templates, channels, preferences),
  `middleware/auth.ts` (+ `middleware/operations.ts` re-export).
- `prisma/schema.prisma` (Category `code`/`skuTemplate`/`skuTemplateVersion`,
  Product `basePrice`, ProductVariant `priceOverride`/`compareAtPrice`/`sku`
  unique/`skuTemplateVersion`/`skuLockedAt`, Attribute `type` free string,
  Coupon/CouponUsage, Review, Notification models + enums), `prisma/seed.ts`
  (roles, permissions, `admin@veyra.local` with admin role only).
- `apps/web/app/admin/**` (products list/new/`[id]`, categories,
  collections, attributes, inventory+scan, orders, payments, fulfillment,
  returns, customers, reviews, coupons, notifications, analytics, audit-logs,
  settings, users, roles), `components/VariantManager.tsx`,
  `ProductMediaManager.tsx`, `AttributeControls.tsx`, `lib/admin-nav.ts`,
  `lib/admin-api.ts` (`can()`, CRUD clients), `lib/product-publish.ts`,
  `lib/session.tsx`.
- Test suite: full `npm test` executed twice (full + targeted rerun).

## 4. Existing Manual Baseline

v1.0 (2026-10-06) was largely accurate: draft-first workflow, autosave +
`DRAFT_CONFLICT`, signed Cloudinary flow, variant preview→create→batch
price/stock, barcode, taxonomy guards, inventory movement audit,
unpaid-only cancel, manual-payment verify/reject, fulfillment queue,
returns pipeline, RBAC-gated nav, audit logging. Its honesty about gaps
(no deletes, read-only settings, partial coupons, technical-default
thresholds) was verified correct and retained. Its defects were all in the
six areas below plus over-cautious wording in three places (§§12.1, 18.x,
20.2) — corrected in v1.1 without changing the manual's structure.

## 5. Existing Audit Findings

The prior audit's §10 items 1–6 were taken as investigation targets. §6
(partially verified) and §7 (not verified) lists were also worked:
coupon redemption (resolved: NOT IMPLEMENTED), analytics/notification/review
definitions (resolved: mechanics VERIFIED, business sign-off open),
staff Suspend gating (resolved: server `requireAdminAccess`, UI note
retained), category hard-delete guard (resolved: `409 CATEGORY_IN_USE` +
children guard, manual accurate), manual-variant media gate (resolved:
publish-time-only, see §12), seed data (PARTIALLY VERIFIED — seeds read,
live DB not inspected), permission-row migrations (NOT VERIFIED — not
re-traced; no claim made), `skuLockedAt` (resolved: column exists, zero
readers/writers in `apps/api/src` — dead column, documented, no migration).

## 6. Discrepancy Classification

| ID | Issue | Classification | Evidence | Action | Status |
|---|---|---|---|---|---|
| D-01 | Category code dead end (VariantManager instructs; form has no field) | DOCUMENTATION DEFECT (code already fixed post-audit) | `admin/categories/page.tsx:159-184` SKU code + template fields, validation `:53-57`, help text `:181-184`; `VariantManager.tsx:59-60,272-280` hint names the field; API accepts `code`/`skuTemplate` `catalogue.ts:136-144,926-933,962-981` | Manual v1.1 §§12.1, 13.3, 19, 21, 23, 28, 29 rewritten to self-service | Closed |
| D-02 | Edit-page publish bypass (create gates, edit allows direct ACTIVE) | INTENTIONAL (no bypass exists: backend gates all transitions) | `catalogue.ts:309-391` transactional readiness check on any non-ACTIVE→ACTIVE; edit page surfaces advisory checklist + server errors `[id]/page.tsx:88-94,136-145,200-205`; regression tests `product-lifecycle.test.ts:112-156` incl. "UI-bypass" case | Manual v1.1 §§18.1, 18.3, 20.2, FAQ, troubleshooting corrected: same rule everywhere, backend authoritative | Closed |
| D-03 | `updateAdminProduct` omits category `code`/`skuTemplate` | INTENTIONAL (audit misreading: fields belong to Category) | `updateAdminCategory` accepts `code`+`skuTemplate` `admin-api.ts:277`; `updateAdminProduct` correctly scoped to Product fields `admin-api.ts:122`; backend `productUpdateSchema` has no category-code fields `catalogue.ts:38-44` | Documented here; no contract change (contracts agree) | Closed |
| D-04 | RBAC/nav mismatch (`can()` 6 strings; Users/Roles hidden from admin) | INTENTIONAL (UX filtering matches backend guards) | `can()` `admin-api.ts:54-68` (unknown⇒deny); nav `superAdminOnly` `admin-nav.ts:82-83,113-121` marked UX-only; catalogue `requireOperationsAccess`, users/roles `requireSuperAdmin`, suspend `requireAdminAccess`, refunds `requireFinancialAccess`; pages redirect to `/admin/unauthorized` | RBAC matrix (§10) + manual §§7, 22 retained; no second RBAC system; backend untouched | Closed |
| D-05 | Attribute type vs admin controls (storefront mapping, admin display-only) | INTENTIONAL (system-managed) | `Attribute.type` free string default STRING `schema.prisma:541-550`, `catalogue.ts:153-156`; admin display-only `attributes/page.tsx:168-170`; storefront mapping keys off slug/name `AttributeControls.tsx:5-9`, `lib/catalog.ts:117-130` | Documented (BD-011); no type editing exposed | Closed |
| D-06 | Variant media gate (create-time error vs publish-time intent) | INTENTIONAL (publish-time-only is the rule) | Media error explicitly filtered with intent comments `catalogue.ts:501-531`; publish requires images+primary `lib/catalog.ts:172-176`; variant→image binding optional `media/products.ts:166-171` | Manual v1.1 §13.3 note + FAQ + §29 clarified (either order; publish requires images) | Closed |
| D-07 | Manual's "contact support for category codes" workflow | DOCUMENTATION DEFECT (same root as D-01) | Same as D-01 | Manual v1.1 corrected | Closed |
| D-08 | Manual's "edit page has no readiness gate" statements | DOCUMENTATION DEFECT (same root as D-02) | Same as D-02 | Manual v1.1 corrected | Closed |

No SOFTWARE DEFECT, CONTRACT DEFECT, SECURITY DEFECT, or UX DEFECT
requiring code changes was found. No `any`-typed reconciliation shortcut
was used; every contract was traced field-by-field (§9).

## 7. Category Code Reconciliation

Questions answered: the code is required only for SKU generation (planner
rejects uncoded categories with `MISSING_CATEGORY_CODE`); it is
business-owned and admin-editable (guarded: 2–5 A–Z0–9, uppercased,
unique); not auto-generated; settable at create and editable later but not
removable from the form (additive-only PATCH `...(code ? {code} : {})`);
`skuTemplate` optional with system default per department
(`sku.ts:222-231`); changing either never rewrites existing SKUs (frozen
`skuTemplateVersion`); no effect on products, URLs, or storefront (codes
never surface publicly). Exposing the field is safe: validation is
duplicated client+server, writes are audited (`CATEGORY_CREATED/...`
paths), and uniqueness is DB-backed (`CODE_ALREADY_EXISTS` via P2002
mapping). VERIFIED.

## 8. Product Publication Reconciliation

Single authoritative mechanism: `checkPublishReadiness`
(`lib/catalog.ts:126-179`) — name ≥2, slug ≥2, category required,
description ≥12, ≥1 ACTIVE variant each with valid SKU + price > 0 + ≥1
attribute mapping + no duplicate combos, ≥1 image + primary. Enforced at
`POST /admin/products` (direct-ACTIVE always rejected with issues,
`catalogue.ts:279-290`) and `PATCH /admin/products/:id` (any
non-ACTIVE→ACTIVE loads variants+images transactionally; failure rolls
back, emits audited `PRODUCT_UPDATED … publishRejected:true`,
`catalogue.ts:318-391`). Frontend checklists (`lib/product-publish.ts`,
create page `publishChecklist`, edit page advisory note) are early
feedback only. Draft autosave schema excludes `status` — autosave can never
publish (`saveProductDraft`, `admin-api.ts:147-152`). Archive of
incomplete products remains allowed (tested). VERIFIED, regression-covered
(`catalog.test.ts`, `product-lifecycle.test.ts`, `product-publish.test.ts`
8 web tests).

## 9. Frontend/API Contract Reconciliation

Traced per feature (Type → client → HTTP → route → zod → service →
Prisma → DB): product create/update/draft (field sets match; `slug`
create-only; `status` excluded from draft schema on both sides);
`updateAdminCategory` ⊇ backend category create/patch fields
(code/skuTemplate included both sides); variant create/update/batch/
generate `price`+`compareAtPrice` nullable semantics match
(`admin-api.ts:156-196` vs `catalogue.ts:60-113`); barcode assign/generate/
generate-missing/lookup match; inventory restock/adjust/batch reason ≥3 and
quantity bounds match; collection PUT replace semantics match; pagination
`{page,pageSize,total,totalPages}` and error envelope
`{success:false,error:{code,message,details?,requestId}}` uniform. No `any`
escapes; no suppressed type errors. `updateAdminProduct` correctly does not
carry category fields (D-03). No gaps remain open.

## 10. RBAC Reconciliation

Matrix (CODE-VERIFIED from guards + page gates + `can()`):

| Capability | CUSTOMER | STAFF | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Storefront/cart/checkout | Yes | Yes | Yes | Yes |
| Admin dashboard (`dashboard.read`) | No (403) | Yes | Yes | Yes |
| Products/categories/collections/attributes/inventory/orders/payments-read/fulfillment/returns/reviews/coupons/notifications/analytics/audit-read | No (401/403) | Yes (`requireOperationsAccess`) | Yes | Yes |
| Customer Suspend/Reactivate; refunds process; `customers.manage`; `settings.manage` | No | No (server `requireAdminAccess`/`requireFinancialAccess`) | Yes | Yes |
| Users list/detail/role grant/revoke; `roles.manage`; Roles page | No | No (server `requireSuperAdmin`; UI redirects to `/admin/unauthorized`) | No (same denial) | Yes |

Frontend `can()` covers `dashboard.read` (operations), `refunds.process` /
`customers.manage` / `users.manage` / `settings.manage` (admin+),
`roles.manage` (super-admin); unknown strings deny. Navigation hides
Users/Roles from non-super-admins with backend as authority — consistent,
not surprising once documented (manual §§7, 22 unchanged and accurate).
No privilege-escalation path: register ⇒ customer only; grants ⇒
super-admin-only audited endpoint; self-lockout denied (`admin.ts`
role routes + `admin-users.test.ts` 4 tests). IDOR guards verified on
media (`getOwnedImage` cross-product 404) and customer detail
(`admin-customers-authz.test.ts` 10 tests). Backend authorization never
weakened in this phase (nothing changed).

## 11. Attribute Reconciliation

Types: no enum — free string default `STRING`; writes uppercased; slug
immutable after creation. Admin manages names + values (+ per-value 1–6
char codes); in-use values/attributes delete-blocked (`409
ATTRIBUTE_IN_USE` / `ATTRIBUTE_VALUE_IN_USE`). Storefront control mapping
is slug/name-driven (Colour→swatch, Size/Shoe Size/Capacity/Power→option,
Material/Style/Brand→facet) with zero dependence on the `type` column;
variant generation is template-token-driven, not type-driven. Changing
`type` would affect nothing — hence display-only is correct. VERIFIED.

## 12. Variant Media Reconciliation

Rule (VERIFIED): draft may exist imageless; variants may be created on an
imageless draft (first variant must be creatable — images can only exist
after the product exists); one shared product image satisfies publishing;
variant-specific image binding optional; publishing requires ≥1 image +
primary; archived products read-only; 20-image cap. The old audit's
"dead-branch suspicion" is resolved by the intent comments at
`catalogue.ts:501-531`. Manual v1.1 teaches order-flexibility with an
images-first recommendation.

## 13. Pricing Reconciliation

(A) No product-level selling price: no `Product.price` column; `basePrice`
nullable fallback, unsettable from every admin UI and product schema
(seed/support only). (B) Selling price = `ProductVariant.priceOverride`
per variant; display/checkout/cart/account consistently compute
`priceOverride ?? basePrice ?? 0`. (C) `compareAtPrice` per-variant exists
backend+client+storefront-display (`PriceDisplay` was/now) but has no
VariantManager field — BUSINESS DECISION REQUIRED (BD-005); not added
here. (D) Discount math: checkout/cart use authoritative backend prices
with stale-price confirmation (`commerce.test.ts` price-flag test);
`OrderItem` snapshots freeze prices; analytics derive from snapshots.
Manual Chapter 15 verified accurate (variant-price-only operation, zero
forbidden, backend-authoritative checkout). No pricing code changed.

## 14. SKU Reconciliation

Generation: planner resolves brand/category/style codes + template-ordered
attribute segments → `generateSku` → UPPER alnum `-`-joined ≤32 chars;
cartesian cap 300 (`TOO_MANY_VARIANTS`); dry-run preview reports
new/existing/skipped; persistence all-or-nothing with pre-flight + P2002
final authority; zero opening stock; frozen `skuTemplateVersion`.
Ownership: system-generates, admin previews/confirms, never types (manual
single-SKU creation validates format + pre-checks uniqueness). Immutable:
schemas exclude `sku` from all updates; category/template/product edits
never rewrite; archived SKUs remain reserved (unique constraint has no
reuse path). `skuLockedAt` is a dead column (no readers/writers) —
documented as such; no migration (forward-only discipline; nothing to
migrate). Manual Chapter 14 verified accurate. `variant-generation.test.ts`
+ `variant-batch.test.ts` + `barcode.test.ts` cover generation,
uniqueness, batch, barcodes.

## 15. Coupon Reconciliation

Creation fields: code (3–40, uppercased, unique), type
(PERCENTAGE/FIXED), value ≥0, status, validFrom/validUntil, maxUses;
UI sends code/type/value/maxUses (no date fields in the form — dates are
API-only). Edit: status/maxUses/validUntil only (code/value/type
permanent). No delete endpoint. No redemption engine: zero coupon
references in checkout/cart/shopping libs; orders do not snapshot coupon
data. Status: admin management IMPLEMENTED; redemption NOT IMPLEMENTED —
manual v1.1 + §29 say exactly this (corrected from "partially
implemented", which overstated checkout behaviour). BD-006.

## 16. Analytics Reconciliation

Every `/admin/analytics/*` requires operations access; full-ISO ranges;
`Africa/Nairobi` bucketing; CSV-only audited exports. Definitions served
by the API itself (`/definitions` → `METRIC_DEFINITIONS`) and the UI has a
Metric Definitions affordance. Core semantics: revenue from non-cancelled
orders; `paidRevenue` (paid, non-cancelled) vs `netSales` (paid −
refunded) vs `grossSales`; AOV = paid revenue ÷ paid orders; product
tables from immutable `OrderItem` snapshots (cancelled orders excluded;
category parents exclude descendants); inventory/low-stock/velocity,
payment/M-Pesa, fulfillment durations, delivery splits/failures,
return/refund/exchange metrics, data-quality checks. The manual's
paid-order-value ≠ audited-revenue distinction is preserved and accurate.
Thresholds remain technical defaults — BUSINESS DECISION REQUIRED
(BD-007). `analytics.test.ts` 11 tests pass.

## 17. Notification Reconciliation

Pipeline VERIFIED: domain events → orchestrator (recipient, deep links,
template render, preference/channel gating) → outbox (PENDING →
PROCESSING → PROCESSED / FAILED / DEAD_LETTER) → worker drain → provider
(log/mock/smtp stubs; production vendors NOT VERIFIED) → delivery records
with attempt counts + backoff (`retry.ts`) → provider HMAC webhooks update
SENT/DELIVERED. Admin: queue with channel/status filters, **Run worker**
drain, **Resend** on FAILED. Customer preferences per
category×channel (TRANSACTIONAL/SECURITY/MARKETING × IN_APP/EMAIL/SMS).
Manual v1.1 teaches queue semantics + worker + resend with exact labels
and promises no guaranteed delivery. BD-008 for channels/vendors/SLAs.

## 18. Review Reconciliation

Creation: no customer submission endpoint or UI found (NOT IMPLEMENTED).
Visibility: storefront aggregates APPROVED-only ratings (VERIFIED).
Moderation: admin list (default PENDING) + Approve/Reject with audited
`REVIEW_MODERATED` including reason (VERIFIED). Ratings derive from
approved rows. Deleted-review auditability: no delete path exists, so
nothing to audit beyond moderation history. Manual v1.1 documents the
moderation queue only and §29 states submission is NOT IMPLEMENTED.
BD-009 for submission/moderation policy.

## 19. Super-Admin Provisioning Reconciliation

VERIFIED: no seeded super-admin, no default super-admin password, no
self-promotion (register ⇒ customer; role grants ⇒ super-admin-only
audited endpoint with self-lockout denial). First super-admin via
documented SQL (`docs/AUTHENTICATION.md`) promoting an existing user;
subsequent grants through the dashboard. Seed dev credential
`admin@veyra.local` carries the **admin** role only and must be rotated
outside local dev (README states this). Manual §§5, 22 + FAQ accurate.
BD-010 records the procedure as operations policy. No auth code changed.

## 20. Business Decisions

Full register: `docs/BUSINESS-DECISIONS.md` (BD-001–BD-012 with
decision/topic/implementation/documentation/problem/options/
recommendation/status/owner/date/impacts). Summary table reproduced in
§28 below.

## 21. Code Changes Made

None. Every discrepancy classified as DOCUMENTATION DEFECT (manual lagged
a post-audit UI fix), INTENTIONAL (backend-authoritative design the audit
misread), or BUSINESS DECISION (correctly left unimplemented). Per
change-control (§37 of the phase brief) and AGENTS.md hard rules, no
second RBAC system, no new API client, no new media system, no migration
(`skuLockedAt` left as a documented dead column), no redesign. The safest
change was zero lines of application code.

## 22. Database/Migration Changes

None. No migration created, applied, or needed. No data deleted; no reset
performed.

## 23. Tests Added

None (no code changed, so no new regression surface). Pre-existing
coverage already locks every reconciled behaviour: publish-readiness unit
(`catalog.test.ts` 5), publish-gate lifecycle incl. UI-bypass rejection +
nothing-changed assertion (`product-lifecycle.test.ts`), web checklist
(`product-publish.test.ts` 8), variant generation/preview/idempotency
(`variant-generation.test.ts`), batch price/status (`variant-batch.test.ts`),
manual variant validation (`variant-manual.test.ts`), media auth + policy
(`media.test.ts`, `policy.test.ts`, `cloudinary.test.ts`), barcodes
(`barcode.test.ts` ×2), RBAC (`admin-users.test.ts`,
`admin-customers-authz.test.ts`, `security.test.ts`), catalogue CRUD +
template-freeze (`catalogue.test.ts`), analytics (`analytics.test.ts`),
contracts/CORS (`contracts.test.ts`, `cors.test.ts`).

## 24. Verification Results

- `npm run typecheck` (api + web): PASS, 0 errors.
- `npm run lint` (api + web): PASS, 0 errors. Pre-existing warnings only:
  one unused `DISCOVERY_PAGE_SIZE` (api) and four `<img>` vs `<Image />`
  suggestions (web) — untouched, unrelated to this phase.
- `npm test` full suite: 59 files / 486 tests — 484 passed, 2 failed on
  `Test timed out in 5000ms` in `commerce.test.ts` (price-flag +
  inventory-concurrency) under full-parallel load. Targeted rerun
  `npx vitest run apps/api/src/routes/commerce.test.ts`: 16/16 PASS.
  Verdict: flaky resource timeouts, unrelated to this phase (no
  application code changed); effective suite state 486/486 PASS.
- `npm run build --workspace @veyra/api` (tsc emit): PASS.
- `npm run build --workspace @veyra/web` (`next build`): PASS —
  compiled successfully, types/lint checks passed, all 60 routes generated
  (`Generating static pages (60/60)`). Pre-render emitted `fetch failed /
  ECONNREFUSED` warnings (no API running beside the build — expected in
  this environment); the build still exited successfully. No application
  code changed in this phase, so this confirms the tree builds cleanly.
- Regression search (`window.confirm|window.alert|window.location.reload|
  params.then|sessions.filter|currentTarget.value|<<<<<<<|=======|>>>>>>>`):
  no `window.confirm`/`alert`/`location.reload` in app code (only an
  explanatory comment and tests); `currentTarget.value` occurrences are
  all synchronous event captures (the guarded pattern); route params are
  synchronous (`route-params.test.ts` guards `params.then`); no conflict
  markers found.
- Product-status handling search: create offers DRAFT/ARCHIVED only
  (ACTIVE server-rejected); edit offers all three with server gating;
  variant ACTIVE/INACTIVE/ARCHIVED consistent across schemas, UI, and
  readiness filter. Consistent.

## 25. Documentation Changes

- `docs/JB-MERCANTILE-ADMIN-USER-MANUAL.md` v1.0 → v1.1: version/date/basis;
  §12.1 self-service code+template workflow + SKU safety rules; §13.3
  corrected blocked-hint + images/variants order note; §§18.1/18.3/20.2
  backend-authoritative publish language; §19 step 8; §21 categories
  summary; §22 coupons (NOT IMPLEMENTED redemption) + notifications (exact
  Run worker/Resend labels); §23 rows 8/19; §25 new images-before-variants
  FAQ; §28 support trigger; §29 rewritten limitation entries with BD
  cross-references. Structure (§24 of the brief) retained.
- `docs/BUSINESS-DECISIONS.md`: created (BD-001–BD-012 + summary table).
- This report: created.

## 26. Remaining Gaps

- G-01 Coupon redemption engine: NOT IMPLEMENTED (BD-006).
- G-02 Customer review submission: NOT IMPLEMENTED (BD-009).
- G-03 Compare-at dashboard field: NOT IMPLEMENTED (BD-005).
- G-04 Product base-price administration: not exposed (BD-004).
- G-05 `skuLockedAt` dead column: no readers/writers; future cleanup or
  removal via forward migration only.
- G-06 Coupon `validFrom`/expiry UI + coupon delete: not exposed.
- G-07 Attribute-value editing: add/remove only (no in-place edit) — as
  designed; noted.
- G-08 `validUntil`/`maxUses` post-creation edits exist in API but only
  status toggle is in the UI workflow — documented.
- G-09 Seed/demo data names vs live store: PARTIALLY VERIFIED.
- G-10 Permission-row migrations: NOT VERIFIED (not re-traced).
- G-11 Live-browser E2E for all §4 workflows: NOT VERIFIED (no tooling).
- G-12 Web pre-render API fetches during `next build`: ECONNREFUSED without
  a running API (environmental, expected; build itself green).

## 27. Risks

- R-01 Publishing through the edit page still *attempts* first and fails
  with errors rather than disabling the control pre-emptively. Safe (server
  authoritative, nothing changes on rejection) but slightly noisier UX.
  Accepted: disabling would duplicate the checklist and tempt divergence.
- R-02 Category codes are now admin-editable; a careless change affects
  future SKU shapes. Mitigated by validation, help text, additive-only
  form semantics, audit logs, and manual safety rules — residual risk is
  operational, owned by BD-002 sign-off.
- R-03 Manual readers on v1.0 copies will still see the dead-end support
  workflow. Mitigated by version bump + §1 basis note; recommend replacing
  distributed copies.
- R-04 Commerce concurrency timeouts under parallel test load suggest CI
  agents need generous timeouts; not an application defect (isolated rerun
  green), but worth a CI-timeout note.
- R-05 Business decisions BD-004–BD-009 remain open; the manual correctly
  promises nothing, but commercial pressure could push staff to improvise
  (e.g. typing original prices into selling-price fields). The manual
  explicitly forbids each improvisation.

## 28. Final Status

RECONCILIATION STATUS: PARTIAL (implementation, contracts, RBAC, and manual
are aligned on all six audit discrepancies; non-critical business
sign-offs and E2E remain open — see G-09/G-10/G-11/G-12).

| Decision | Status | Current rule | Required action |
|---|---|---|---|
| SKU ownership (BD-001) | IMPLEMENTATION-DEFINED | Server-generated, immutable, DB-unique | Owner sign-off |
| Category code (BD-002) | IMPLEMENTATION-DEFINED | Admin-editable, guarded, never rewrites SKUs | Owner sign-off on setters |
| SKU template (BD-003) | IMPLEMENTATION-DEFINED | Admin-editable, versioned, future-only | Owner sign-off |
| Pricing model (BD-004) | BUSINESS DECISION REQUIRED | Variant-price-only in practice | Owner confirms model |
| Compare-at pricing (BD-005) | BUSINESS DECISION REQUIRED | Backend-ready, no dashboard field | Owner decides if wanted |
| Coupons (BD-006) | BUSINESS DECISION REQUIRED | Admin CRUD only; redemption NOT IMPLEMENTED | Owner defines redemption |
| Analytics (BD-007) | BUSINESS DECISION REQUIRED | Nairobi TZ, served definitions; thresholds default | Owner confirms definitions |
| Notifications (BD-008) | BUSINESS DECISION REQUIRED | Queue/worker/resend; vendors NOT VERIFIED | Owner confirms channels/vendors |
| Reviews (BD-009) | BUSINESS DECISION REQUIRED | Moderation queue live; submission NOT IMPLEMENTED | Owner decides policy |
| Super-admin provisioning (BD-010) | IMPLEMENTATION-DEFINED | DB promotion, no default password | Owner acknowledgement |
| Attribute types (BD-011) | IMPLEMENTATION-DEFINED | System-managed, display-only | Owner acknowledgement |
| Variant images (BD-012) | IMPLEMENTATION-DEFINED | Optional per-variant; ≥1+primary to publish | Owner acknowledgement |
