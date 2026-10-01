# Product Creation UX Redesign Report — JB Mercantile

Status: IMPLEMENTED · Verified: typecheck + lint + 431 tests + production build pass.
Date: 2026-10-01. Scope: `/admin/products/new` workspace only (+ one additive
optional prop on the shared media manager, pure helpers, CSS). No schema,
API, auth, RBAC, Cloudinary, or catalogue-architecture changes.

## 1. Existing product creation architecture

- `apps/web/app/admin/products/new/page.tsx` — draft-first workspace
  (already mature): `productDraftSchema` + `publishChecklist`
  (`lib/product-publish.ts`, frontend mirror of backend
  `validateCatalogProduct`), `ProductMediaManager` (signed Cloudinary
  queue, reorder buttons, primary/alt/replace/delete with confirms),
  `VariantManager` (server-authoritative SKU dry-run preview, matrix,
  batch price/restock), live categories/collections/attributes, SEO
  preview, review checklist, sticky actions, `beforeunload` dirty guard.
- Edit page (`[id]/page.tsx`) shares the same cards/managers/patterns.
- Backend (`apps/api/src/routes/catalogue.ts` + `lib/catalog.ts`):
  `POST /admin/products` `{name, description, categoryId?, slug?, status,
  styleCode?}` (category optional at creation); publish-readiness =
  category + ≥1 ACTIVE variant (valid SKU, price > 0, ≥1 attribute value)
  + ≥1 image; `PATCH` status flip NOT readiness-gated; audit logs
  `PRODUCT_CREATED/UPDATED`; `requireOperationsAccess` throughout.

## 2. Existing API contract

- Creation: POST → product (slug auto-generated server-side, unique
  constraint authoritative, `conflict()` on collisions).
- Post-draft: media CRUD `/images*` (+primary/reorder/replace),
  variant generate/batch/restock, PATCH product fields.
- Publish: PATCH `{status:'ACTIVE'}` + navigate to editor. No dedicated
  publish endpoint, no draft autosave endpoint, no product↔collection
  assignment endpoint (collections managed from Collections admin).

## 3. Existing product/variant/inventory structure

- Product (DRAFT/ACTIVE/ARCHIVED) → Variants (SKU immutable, ACTIVE/
  INACTIVE/ARCHIVED, priceOverride/compareAtPrice, attribute mappings) →
  Inventory auto-created at zero on hand (`Available = onHand −
  reserved`); media = ProductImage rows bound to productId (hence
  draft-first — no orphans by construction).

## 4. UX problems identified (all verified in source)

1. Header had TWO buttons both calling `createDraft(false)` — "Create
   Product" could never publish (dead `publish` path, misleading).
2. Post-draft basic-info edits went nowhere (save disabled in `complete`
   phase — silent data trap).
3. Checklist/media counts required a manual "Refresh publish checklist"
   button (stale after every upload/delete).
4. No in-app Cancel (only `beforeunload`; router navigation unguarded).
5. Error summary listed messages without field links.
6. No storefront preview; status options unexplained; collections/
   attributes lacked empty states and management links.
7. `.form-field-full` class had no CSS rule (description spanned 1 col).

## 5. New information architecture

- Same 7 sections, tightened: 1 Basic (+Save changes when drifted),
  2 Media (auto-sync), 3 Variants/SKUs/pricing (+inventory pointer),
  4 Categories & collections, 5 Attributes, 6 SEO (honest derived-only
  copy), 7 Review & publish — plus sidebar Setup-progress card
  (`done/total` + anchored section statuses) and live Storefront preview.
- Header/sticky bar are phase-aware: draft → Cancel + Save Draft;
  complete → status badge + Open editor + Publish (disabled with reason
  until variant + image exist). No fake publish workflow.

## 6. Media workflow

- Unchanged signed flow; new optional `onChanged(images)` prop on
  `ProductMediaManager` (ref-held, no effect churn) auto-syncs checklist
  counts + preview thumbnail. Manual refresh button removed. No second
  lifecycle; no orphans (product-first preserved).

## 7. Variant workflow

- `VariantManager` untouched; parent now derives variant count AND price
  range (effective `priceOverride ?? basePrice` via `priceRange()`) for
  the checklist + preview. Duplicate prevention stays server-side
  (dry-run preview + unique constraints).

## 8. Pricing workflow

- No product-level price in the model (correct — per-variant). Pricing
  UX = variant matrix (existing) + preview min–max via `formatKES`.
  No cost field invented; no float math added.

## 9. Inventory workflow

- Creation starts variants at zero (existing); workspace links to
  `/admin/inventory` for stock-up; no duplicate records; `Available =
  onHand − reserved` untouched.

## 10. Validation UX

- Zod pre-validation preserved; error summary items are now buttons
  focusing their fields (id-mapped); inline `aria-invalid`/`aria-describedby`
  kept; labels use `htmlFor`; backend errors surface via message + toast
  with form state fully preserved; duplicate submission guarded by
  `saving` disables; success navigates to editor (publish) with next
  actions (Open editor / View storefront — both real routes).

## 11. Responsive behavior

- Existing workspace grid + sticky bar kept; new progress/preview cards
  live in the side column (stacks below on mobile per existing
  breakpoints). Code-audited; device testing NOT performed.

## 12. Accessibility improvements

- Error-summary-to-field focus, labelled inputs, section anchors,
  keyboard-operable managers (unchanged), dialog-based Cancel (never
  `window.confirm`), `role="alert/status"` preserved. No AT run.

## 13. Theme support

- Token-only additions (progress, preview, error list inherit
  `--jb-*`); no second theme. Screenshot QA not performed.

## 14. Permission handling

- No frontend permission system added; shell `requireOperationsAccess`
  + backend 403s authoritative; media/variant endpoints already
  staff-capable per backend tests. Cancel/publish copy states no
  implied capabilities.

## 15. Tests performed

- `typecheck` web — pass. `lint` web — 0 errors (pre-existing `<img>`
  warnings only). Full `npm test` — 54 files / 431 pass (4 new:
  `canPublishNow`, `checklistProgress`, `basicFieldsDirty`,
  `priceRange`). `next build` web — pass. Conflict markers — none;
  `git diff --check` — clean. No browser/device testing.

## 16. Components modified

- `app/admin/products/new/page.tsx` (rewrite, same route/exports),
  `components/ProductMediaManager.tsx` (+optional `onChanged`),
  `lib/product-publish.ts` (+4 helpers), `lib/product-publish.test.ts`
  (+4 tests), `app/globals.css` (+progress/preview/error/form CSS).
  Untouched: edit page, VariantManager internals, APIs, schema, RBAC.

## 17. Known limitations

1. Backend does NOT gate `PATCH` status→ACTIVE on readiness — the UI
   gate is staff-protective UX, not authorization. A readiness check on
   publish is a backend follow-up (out of scope).
2. No product↔collection assignment endpoint — stated honestly in-UI.
3. No draft autosave endpoint — explicit saves only (no fake autosave).
4. No runtime walkthrough (no live API/DB here); media/variant flows
   verified by code + existing backend test-suite evidence only.
