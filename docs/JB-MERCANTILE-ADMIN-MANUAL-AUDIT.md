# JB Mercantile Admin Manual — Documentation Audit Report

For project maintainers. Companion to `JB-MERCANTILE-ADMIN-USER-MANUAL.md`
(the end-user manual). Read-only audit; no application code was modified.
No live browser testing was available; no production data was touched.

## 1. Repository areas inspected

- `apps/web/app/admin/**` — all 39 `page.tsx` files (shell, dashboard,
  products list/new/`[id]`, categories, collections, attributes,
  inventory + movements + scan, orders + `[orderNumber]`, payments,
  fulfillment, returns, customers + `[id]`, reviews, coupons, notifications,
  analytics + 11 sub-pages, audit-logs, settings, users + `[id]`, roles,
  unauthorized) and `app/admin/layout.tsx`.
- `apps/web/components/` — `AdminShell` adjacent: `VariantManager.tsx`,
  `ProductMediaManager.tsx`, `AttributeControls.tsx`, `ConfirmDialog.tsx`,
  `jb-ui.tsx`, `admin.tsx`, `Header.tsx`, `AccountMenu.tsx`, `AuthForms.tsx`;
  `apps/web/lib/` — `admin-nav.ts`, `admin-api.ts`, `media-upload.ts`,
  `session.tsx`.
- `apps/api/src/routes/` — `admin.ts`, `catalogue.ts`, `product-media.ts`,
  `media.ts`, `storefront.ts` (admin detail), `fulfillment.ts`,
  `payments.ts`, `returns.ts`, `notifications.ts`, `account.ts`,
  `analytics.ts`, `auth.ts`, `shopping.ts`; `lib/` — `admin.ts`,
  `variant-generation.ts`, `variant-generation-service.ts`, `sku.ts`,
  `barcode.ts`, `catalog.ts`, `checkout.ts`, `shopping.ts`, `orders.ts`,
  `reservations.ts`, `fulfillment.ts`, `media/{service,cloudinary,policy,
  products}.ts`, `notifications/{events,worker,orchestrator}.ts`,
  `permissions.ts`, `account/account.ts`; `middleware/auth.ts`.
- `prisma/schema.prisma` (all catalogue/commerce/identity models),
  `prisma/seed.ts`, `prisma/seed.catalogue.ts`.
- `docs/` — `ADMIN.md`, `AUTHENTICATION.md`, `CATALOGUE.md`, `INVENTORY.md`,
  `CLOUDINARY.md`, `TROUBLESHOOTING.md`, `PRODUCT-CREATION-API-FIX-REPORT.md`,
  `PRODUCT-UI-ROUTE-FIX-REPORT.md`, `PHASE-E-FINAL-QA-REPORT.md`, plus the
  report index. Root `README.md`, `AGENTS.md` (working rules observed).

## 2. Main routes and components inspected

- Admin entry `app/admin/page.tsx` → redirect `/admin/dashboard`; shell
  `app/admin/AdminShell.tsx` (session gate, sidebar, collapse, account
  menu, logout confirm); nav definition `lib/admin-nav.ts`
  (`ADMIN_NAV_SECTIONS`, `visibleNavSections`, `isNavActive`,
  `primaryRoleLabel`).
- Products: list (`products/page.tsx`), creation workspace
  (`products/new/page.tsx`, ~804 lines, draft-first with autosave +
  `DRAFT_CONFLICT` handling + publish checklist), editor
  (`products/[id]/page.tsx`, direct status save, no autosave/gate).
- `VariantManager.tsx` (dimension picker, dry-run SKU preview, idempotent
  create, batch price/stock, archive/restore, barcode generate,
  `variant-matrix.ts` validation), `ProductMediaManager.tsx` (signed
  direct-to-Cloudinary upload, primary/reorder/replace/delete/alt-text),
  `AttributeControls.tsx` (storefront filters only — no admin wiring).
- Taxonomy pages (categories/collections/attributes), inventory pages
  (index/movements/scan), and all §1 order/customer/commerce/insight/system
  pages (skimmed for purpose, headings, key actions).

## 3. Backend endpoints and business rules inspected

- Full admin catalogue surface in `routes/catalogue.ts` (products CRUD +
  draft autosave with `expectedUpdatedAt`, publish-gated `PATCH`,
  manual/batch variant endpoints, variant generation with `dryRun`,
  barcode generate/assign/generate-missing/lookup, inventory
  list/movements/reservations/restock/restock-batch/adjust, taxonomy CRUD
  with in-use guards, collection replace-semantics `PUT`).
- Media in `routes/product-media.ts` + `routes/media.ts` (sign-upload with
  operations gate for product context; attach with authoritative
  re-validation; primary/reorder/replace/delete; 20-image cap; archived =
  read-only).
- Operations surface in `routes/admin.ts` (dashboard aggregates, orders
  incl. unpaid-only cancel, read-only payments + financial manual
  verify/reject, customers with admin-escalated status change, reviews,
  coupons, super-admin users/roles, stale-reservation sweep, read-only
  settings) plus fulfillment/payment/return/analytics/notification routes.
- Guards: `requireAuth` (cookie `veyra_session`, active accounts only);
  `requireOperationsAccess` (staff/admin/super_admin); `requireAdminAccess`/
  `requireFinancialAccess` (admin+); `requireSuperAdmin`; `requirePermission`
  exists but no catalogue route uses it. Register auto-assigns `customer`;
  grants via super-admin-only audited endpoint (self-lockout denied).
- Validation: zod schemas with exact constraints (product name 2–200,
  description 12–10 000, slug normalised, category required at publish,
  variant price strictly > 0 at publish, image + primary required at
  publish); error contract `{success:false, error:{code,message,details?,
  requestId}}`; publish readiness issue codes (`NO_ACTIVE_VARIANT`,
  `INVALID_PRICE`, `NO_IMAGES`, `NO_PRIMARY_IMAGE`, …);
  `DRAFT_CONFLICT` optimistic concurrency; stock math `available =
  max(onHand − reserved, 0)` used consistently in catalogue, cart, and
  checkout.

## 4. Product creation workflow reconstructed

Draft-first, all links verified in code: `POST /admin/products` (forced
DRAFT; ACTIVE rejected) → `PATCH …/draft` autosave (status immutable,
`expectedUpdatedAt` conflict → canonical reload) → signed Cloudinary media
(`POST /media/sign-upload` → direct upload → `POST …/images`, first =
primary) → variant generation (`POST …/variants/generate`, cartesian ≤300,
deterministic server SKUs, `existing` never duplicated, zero opening stock)
→ per-variant prices (`PATCH …/variants` batch) → stock (`POST
…/inventory/:variantId/restock|adjust` with ≥3-char reason, no negatives,
reserved protected) → collections (`PUT …/collections`, replace semantics)
→ `PATCH /admin/products/:id` status → ACTIVE with `checkPublishReadiness`
(transactional, `PRODUCT_NOT_READY_FOR_PUBLISH` + issues on failure) →
storefront (`/products/:slug`, ACTIVE-only public reads). Edit page bypasses
the gate (direct status save) — documented in the manual as use-with-care.

## 5. Features verified end-to-end (code-level)

Draft/autosave/conflict UX; media upload→persist→primary→reorder→replace→
delete with provider-cleanup reporting; variant preview→create→batch
price/stock→archive/restore; barcode generate/lookup/replace; taxonomy CRUD
with in-use/child guards; collection assignment; inventory restock/adjust
with movement audit; reservations read-only; scan station; order/fulfilment/
return/payment-manual flows at route level; RBAC gates incl. unauthorized
page and login `redirect` round-trip (safe internal targets only); audit
logging on sensitive mutations. Full test suite state on current code: 59
files / 484 tests passing (run during the preceding task on identical app
code; this task added docs only).

## 6. Features only partially verified

- Live-browser E2E for every workflow above (static code + tests only; no
  browser tooling in this environment).
- Coupon redemption at checkout (`docs/ADMIN.md` marks partial).
- Analytics thresholds/definitions and notification delivery guarantees.
- Review storefront visibility rules; password-reset/email-verification
  flows (models exist, flows not traced).
- Staff-level gating of the customer Suspend button (server enforces
  admin+; UI gating not confirmed).
- `deleteAdminCategory` hard-block with products (UI warns; server guard
  reported but not re-traced here).
- Whether manual single-variant creation is currently impossible on
  imageless products (`catalogue.ts` media-gate dead-branch suspicion).

## 7. Features not verified

- Actual seed/demo data present in any live database (seed files read, live
  DB not inspected).
- Later migrations seeding granular permission rows referenced by
  `permissions.ts` catalog slugs.
- `skuLockedAt` semantics (column exists; no reader/writer found).
- Report-export contents, notification resend behaviour, refund completion
  endpoints (`returns.ts:81-93` not fully inventoried).

## 8. Features not implemented (dashboard gaps taught honestly in the manual)

Category dictionary `code`/`skuTemplate` editing; attribute `type` editing
and attribute-value editing; manual barcode entry in VariantManager;
per-variant compare-at price field; product-level base price field;
product/variant hard delete; category hard delete; coupon code/value/type
editing and coupon delete; direct reservation mutation; editable settings;
self-service password reset (unconfirmed); multi-store/marketplace features
(single-store D2C by design).

## 9. Known issues affecting the manual

Historical reports (`PRODUCT-CREATION-API-FIX-REPORT.md`,
`PRODUCT-UI-ROUTE-FIX-REPORT.md`, `PHASE-E-FINAL-QA-REPORT.md`) claim fixes
for: variant-generation 400s (UI now gates dry-run with `previewBlockedReason`
+ stale-guard, single explicit create), primary-image 400s (content-type only
with body + empty-JSON parser, regression tests cited), collection PUT CORS
(verbs/methods now include PUT), and form runtime errors (`params.then`,
null-value reads, `window.confirm`, hydration, date/zone 400s — all show
guarded patterns in current code). All are FIXED-STATIC, E2E UNCONFIRMED by
the reports' own §8 statements; the manual therefore teaches the supported
paths, warns against double-submission, and routes anomalies to support with
exact-message escalation. No live defect was observed in static inspection;
nothing was changed to fix anything in this task.

## 10. Important discrepancies between frontend and backend

1. VariantManager instructs staff to set the category dictionary code via
   “Categories → edit”, but the categories form has no code field (API
   accepts `code` on create/patch). Staff hit a dead end — needs a UI field
   or a support-owned procedure (manual uses the latter).
2. Edit page allows direct ACTIVE status with no readiness gate, while the
   create page gates publishing — same backend endpoint, different frontend
   discipline.
3. `updateAdminProduct` type omits category `code`/`skuTemplate` though the
   API accepts them — even a code-aware UI could not save via current client
   typings without a client update.
4. UI `can()` covers 6 permission strings and nav hides Users/Roles from
   `admin`, yet `admin` passes some API guards customers of those pages —
   sidebar/API visibility mismatch is intentional-but-surprising.
5. `AttributeControls` type→control mapping is storefront-only; admin
   attribute `type` is display-only — no functional link between them.
6. Manual-variant media gate looks stricter than its own code comment
   (publish-time-only intent vs. create-time error path) — behaviour to
   confirm before documenting single-variant creation on imageless products
   (manual teaches images-first regardless).

## 11. Manual sections requiring business-owner confirmation

SKU format/code ownership policy; whether was/now (compare-at) pricing is
wanted; variant-price-only vs product base price model; coupon redemption
behaviour before advertising coupons; analytics thresholds/definitions;
notification delivery expectations; review visibility rules; first
super-admin provisioning procedure; image size/quality standards beyond
format rules.

## 12. Recommended future documentation/training improvements

1. Capture real screenshots (admin sign-in, dashboard, product list, new
   workspace, media, variant matrix, publish) in a staging environment with
   clearly labelled demo data; replace §12-equivalent text navigation
   where most valuable.
2. Record a 10-minute publish-a-product walkthrough following manual
   Chapter 19; keep the audit §6 list as the test script for live E2E
   confirmation.
3. Add a one-page printed quick-reference (manual Chapter 27) at packing/
   catalogue workstations.
4. When gaps in §8 are closed (category codes, compare-at UI, base price
   decision), update manual Chapters 12/15/16 and this report together.
5. Confirm §11 items and move each to either the manual or a `docs/`
   decision record (`BUSINESS-DECISIONS.md` pattern).
