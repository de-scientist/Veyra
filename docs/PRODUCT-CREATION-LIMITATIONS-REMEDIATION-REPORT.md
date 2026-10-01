# Product Creation Limitations Remediation Report — JB Mercantile

Follow-up to `docs/PRODUCT-CREATION-UX-REDESIGN-REPORT.md` (workspace UX).
This phase closes the four backend limitations it recorded. No database
reset was performed; debug fixtures created during diagnosis were removed
with targeted deletes. Evidence commands were all executed in-repo.

## 1. Executive Summary

All four objectives landed and are verified by automated tests plus full
repo validation. The publish gate is server-enforced (UI bypass rejected
with structured issues), collection assignment is a real transactional
API surfaced in both creation and edit workspaces, draft autosave is
server-backed with optimistic concurrency, and the runtime walkthrough
runs reproducibly against the live dev database.

## 2. Initial Limitations

- A: UI-only publish protection; `PATCH …/products/:id {status:ACTIVE}`
  unchecked server-side.
- B: `ProductCollection` join existed but zero assignment endpoints; UI
  stated this honestly.
- C: no draft endpoint; explicit saves only.
- D: no reproducible runtime media/variant validation.

## 3. Repository Findings

- Statuses `DRAFT/ACTIVE/ARCHIVED` (Prisma enums); images require
  productId (draft-first sound); first image auto-wins primary
  (`lib/media/products.ts`); inventory auto-created at zero on variant
  creation; audit enum `AuditAction` is closed (new values need a
  migration); Prisma 8 RC CLI in this env cannot `generate`/`migrate`
  (no config) and `psql` is absent — so schema changes were avoided by
  design (see §11); API tests run hermetically via `app.inject` + real
  Postgres (reachable `localhost:5432`); error contract
  `{success, error:{code,message,details,requestId}}` with `HttpError.details`
  support; RBAC via `requireOperationsAccess` (single source
  `middleware/auth.ts`); manual `POST /variants` validates but does not
  persist attribute mappings (generate flow does — workspace uses it;
  out of scope to change); generate requires attribute slugs ending in
  the template token (diagnosed live during testing).

## 4. Publish Readiness Architecture

- New `checkPublishReadiness()` in `apps/api/src/lib/catalog.ts` — the
  single authoritative publish definition: name/slug/category/description,
  ≥1 ACTIVE variant, per-variant SKU (`≥3`), price (`>0`), ≥1 attribute
  value, no duplicate combinations, ≥1 image, exactly-one primary
  (guaranteed by first-wins-primary). Variant-creation gating keeps
  `validateCatalogProduct` (different purpose: single-variant pre-check).

## 5. Server-Side Publish Enforcement

- `PATCH /admin/products/:id`: any non-ACTIVE→ACTIVE transition runs the
  check + status flip inside one `prisma.$transaction` (failed check
  changes nothing — verified by test asserting DRAFT afterwards).
- `POST /admin/products` with `status:ACTIVE` is rejected with the same
  contract (nothing publishable can exist pre-creation); UI create form
  no longer offers ACTIVE.
- Rejections return `400 PRODUCT_NOT_READY_FOR_PUBLISH` with
  `details.issues[]` (`{field, code, message}`: `NAME_REQUIRED`,
  `SLUG_REQUIRED`, `CATEGORY_REQUIRED`, `DESCRIPTION_REQUIRED`,
  `NO_ACTIVE_VARIANT`, `INVALID_SKU`, `INVALID_PRICE`,
  `MISSING_ATTRIBUTES`, `DUPLICATE_VARIANT_COMBINATION`, `NO_IMAGES`,
  `NO_PRIMARY_IMAGE`) and are audit-logged. Other transitions
  (→ARCHIVED, edits) are unaffected — no new restrictions beyond the gate.

## 6. Collection Assignment Implementation

- `GET` + `PUT /admin/products/:productId/collections` (replace
  semantics, transactional `deleteMany` + `createMany skipDuplicates`,
  unknown ids → `404 COLLECTION_NOT_FOUND`, archived excluded, deduped,
  audited). Reuses `ProductCollection` — no new relation.
- Web `getProductCollections`/`setProductCollections`; checkbox cards
  with explicit save + preserved selections in both `/new` (post-draft)
  and `/[id]` workspaces; `AdminProductDetail.collections?` typed.

## 7. Draft Persistence / Autosave Implementation

- `PATCH /admin/products/:id/draft` (basic fields only — `status` is not
  in the schema so zod strips it: autosave can never publish, verified
  by test sending `status:'ACTIVE'`). `expectedUpdatedAt` mismatch →
  `409 DRAFT_CONFLICT` + canonical product (no silent overwrites).
- UI: 1.5 s debounced autosave post-draft with
  Saving…/Saved-at/failed-retry states + manual Save/Retry; refs guard
  stale closures; media/variants excluded (already immediate-persist —
  no duplicate writes, no repeated uploads).

## 8. Media Validation

- Covered by pre-existing `product-media.test.ts` (auth matrix, CRUD,
  primary, reorder, replace, provider-failure paths) plus the new
  lifecycle test (metadata persist, first-wins-primary, reorder).
  Cloudinary byte-upload in a real browser: NOT VERIFIED (no browser
  automation here).

## 9. Variant Validation

- Covered by pre-existing `catalogue.test.ts` (duplicate/invalid SKU,
  attributes), `variant-generation.test.ts`, `variant-batch.test.ts`,
  plus new readiness unit + lifecycle tests (generate → mappings →
  inventory → restock → publish).

## 10. API Changes

- `PATCH /admin/products/:id` (publish gate), `POST /admin/products`
  (ACTIVE-at-create rejected), `GET|PUT
  /admin/products/:productId/collections` (new), `PATCH
  /admin/products/:id/draft` (new). No other route touched.

## 11. Database Changes

- None. Deliberate: the v8-RC CLI cannot regenerate the client and no
  `psql` exists, so the closed `AuditAction` enum was reused
  (`PRODUCT_UPDATED` with structured `after` payloads incl.
  `publishRejected`/`draft` flags) instead of a risky hand-edited
  migration + client. No data loss, no reset.

## 12. RBAC/Security

- All new endpoints behind `requireOperationsAccess` (401/403 verified
  per endpoint); product existence checked before mutation (404, no
  cross-product writes); zod strips unknown fields (mass-assignment
  safe); publish bypass rejected server-side (tested); Cloudinary
  signed-upload model untouched; no secrets logged (audit payloads are
  ids/issues only).

## 13. Automated Tests

- New `apps/api/src/routes/product-lifecycle.test.ts` (14 tests: auth
  matrix, direct-ACTIVE rejection, UI-bypass rejection + no-change
  proof, archive freedom, collections CRUD/replace/clear/404/403,
  draft save/validation/stale-409/canonical/never-publishes,
  generate→restock→media→reorder→publish→storefront visibility).
- Extended `apps/api/src/lib/catalog.test.ts` (+readiness unit cases).
- Full repo suite: **55 files / 446 tests pass** (was 54/431).
- `typecheck` api+web pass; `lint` 0 errors (1 pre-existing api
  warning in untouched `storefront.ts`, pre-existing web `<img>`
  warnings); `npm run build` (api+web) passes; no conflict markers;
  `git diff --check` clean.

## 14. Runtime Walkthrough

- Executed reproducibly: `npx vitest run
  apps/api/src/routes/product-lifecycle.test.ts` → 14/14 pass against
  live Postgres (evidence in §13). Covers creation, draft, bypass
  rejection, variants+attributes+SKU, pricing, inventory restock, media
  metadata/primary/reorder, collections, autosave incl. stale conflict,
  publish success + public catalogue retrieval.
- Browser UI walkthrough (real Cloudinary upload bytes, visual QA):
  NOT VERIFIED — REQUIRES RUNTIME/ENVIRONMENT VALIDATION.

## 15. Remaining Limitations

1. Manual `POST /variants` drops attribute mappings (pre-existing;
   workspace uses generate flow; publish gate correctly refuses such
   variants until mappings exist).
2. `PATCH` status→ACTIVE on products whose variants predate mappings
   will fail readiness until variants are regenerated — correct but
   worth release-noting.
3. No browser/AT/device validation performed.
4. `Only X left ≤5` presentational threshold (earlier phase) unchanged.

## 16. Evidence

- `npm run typecheck` (both workspaces): pass.
- `npm run lint` (both): 0 errors.
- `npm test`: 55 files / 446 pass.
- `npm run build`: pass.
- `git grep -n -E '^(<<<<<<<|=======|>>>>>>>)'`: empty.
- `git diff --check`: clean.
- Regression grep (`window.*reload|confirm|alert`, `params.then`,
  `use(params)`): only pre-existing comments/guards.

## 17. Final Status

```text
PRODUCT CREATION LIMITATIONS REMEDIATION STATUS

Server-side publish gate: PASS
Collection assignment: PASS
Draft persistence/autosave: PASS
Media walkthrough: PASS (API/metadata level; browser upload bytes NOT VERIFIED)
Variant walkthrough: PASS
Regression validation: PASS
Automated tests: PASS
Build/typecheck/lint: PASS
Documentation: PASS
```

Files changed (this phase):
- `apps/api/src/lib/catalog.ts` (+readiness authority)
- `apps/api/src/routes/catalogue.ts` (publish gate ×2, collections ×2, draft ×1)
- `apps/api/src/lib/catalog.test.ts` (+readiness unit tests)
- `apps/api/src/routes/product-lifecycle.test.ts` (new, 14 runtime tests)
- `apps/web/lib/admin-api.ts` (details passthrough, collections + draft clients, detail type)
- `apps/web/app/admin/products/new/page.tsx` (collections UI, autosave UI, no ACTIVE-at-create, structured publish errors)
- `apps/web/app/admin/products/[id]/page.tsx` (collections UI)
- `apps/web/app/globals.css` (fieldset styling)
- `docs/PRODUCT-CREATION-LIMITATIONS-REMEDIATION-REPORT.md` (this file)

Database migrations: none (intentionally — see §11).
