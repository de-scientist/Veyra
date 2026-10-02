# V8-RC Limitations Remediation Report — JB Mercantile

Follow-up to `docs/PRODUCT-CREATION-LIMITATIONS-REMEDIATION-REPORT.md`, which
closed its four objectives but recorded four remaining limitations. This phase
closes what the current environment permits and honestly records what it does
not. No database reset was performed; no migration was created.

Companions: `docs/V8-RC-ARCHITECTURE-NOTES.md` (decisions),
`docs/V8-RC-VALIDATION-MATRIX.md` (per-test evidence and statuses).

## 1. Executive Summary

The real data-integrity defect — manual `POST /variants` silently dropping
attribute mappings — is fixed: mappings are now resolved, validated, and
persisted atomically with a structured `VARIANT_CREATED` audit, covered by 12
new regression tests. The publish readiness gate is preserved and
re-verified as defense in depth. Schema, generated client, API contracts,
and RBAC are unchanged. Cloudinary actual byte-upload was verified at the
provider level with a live runtime probe (upload → metadata → destroy).
Browser, assistive-technology, and physical-device validation were not
possible in this environment and are recorded as NOT VERIFIED with a
reproducible checklist — not as passes.

## 2. Original Limitations

1. No schema migration by design (v8-RC CLI cannot safely regenerate the
   Prisma client).
2. Manual `POST /variants` creates variants without attribute mappings.
3. Browser / accessibility-assistive-technology / device validation not
   performed.
4. Cloudinary byte-upload never exercised in a headless/runtime environment.

## 3. Repository Findings

- Data model confirmed from the actual schema: `Product → ProductVariant →
  VariantAttributeValue → AttributeValue → Attribute`
  (`prisma/schema.prisma`), with `@@unique([variantId, attributeId,
  attributeValueId])` and unique `sku`. No model change required.
- Root cause traced end to end: `POST /admin/products/:productId/variants`
  (`apps/api/src/routes/catalogue.ts`) parsed `attributeValues` and even
  ran them through `validateCatalogProduct`, but the `prisma.$transaction`
  created only `ProductVariant` + `Inventory` — mappings were discarded.
  The response serialization did not hide them; the rows were never written.
- Gap inside the gap: the readiness pre-check only inspects ACTIVE
  variants, so an `INACTIVE` manual variant with zero mappings passed
  validation and persisted mapping-less. The publish gate later refused
  such variants (`MISSING_ATTRIBUTES`) — correct, but late.
- Event mechanism: `AuditLog` with closed `AuditAction` enum. Manual
  creation emitted `VARIANT_UPDATED` with `{ sku }` only; the generate flow
  emits `VARIANT_CREATED`. `PRODUCT_UPDATED` carries product-level events
  (publish rejections, draft saves, collection assignment). No second
  event system exists or was created.
- Cloudinary: signed direct-upload authorization (server-side signing,
  secret never leaves the server) + provider-result normalization +
  `ProductImage` persistence with orphan cleanup. Only signing and metadata
  paths were test-covered; no live byte-upload evidence existed.
- Frontend: no UI caller posts manual variants (the workspaces use the
  generate flow); `createAdminVariant` is the typed client. Admin detail
  (`GET /admin/products/:id`) already returns mappings.
- Validation package (`packages/validation`) holds no variant-attribute
  contract — the route-local zod schema is the single contract.

## 4. Schema Decision

```text
Schema unchanged. Existing generated Prisma client retained.
Existing event/audit mechanism extended where required.
```

`git diff` shows zero changes under `prisma/`. The pinned Prisma
`8.0.0-rc.15` CLI in this environment does not even register a `validate`
command, confirming there is no safe regenerate path to attempt. Client
compatibility is proven at runtime instead: the full suite (56 files / 458
tests) exercises every touched table against live PostgreSQL. Full
rationale: `docs/V8-RC-ARCHITECTURE-NOTES.md` §1.

## 5. PRODUCT_UPDATED Strategy

No new `AuditAction`, no new event system, no payload-format break:

- Manual variant creation now emits the pre-existing `VARIANT_CREATED`
  action (aligned with the generate flow; previously `VARIANT_UPDATED`
  with `{ sku }`) with a structured, additive `after` payload
  (`entity / productId / operation / variantId / sku / price / status /
  attributeMappings` — ids and display values only, no secrets/PII).
- Existing consumers key on `action / entity / entityId` (unchanged
  columns, unchanged closed enum). The only in-repo `VARIANT_UPDATED`
  reader covers barcode paths in `lib/barcode.ts`, which are untouched.
- `PRODUCT_UPDATED` is preserved untouched for product-level events.
- The audit write moved inside the creation transaction (same pattern as
  the generate flow), so audit failure also rolls back — atomicity in
  both directions.

## 6. Variant API Fix

`POST /admin/products/:productId/variants` now:

- Accepts legacy `{ attributeId, value }` (exact-match resolution, never
  auto-created) plus `{ attributeValueId }` and
  `{ attributeId, attributeValueId }` — one flexible contract, no second
  representation.
- Rejects: zero mappings for any status (`400 VARIANT_ATTRIBUTES_REQUIRED`);
  unknown ids/pairs (`400 ATTRIBUTE_VALUE_NOT_FOUND`); cross-attribute
  mismatches (`400 INVALID_VARIANT_ATTRIBUTES`); repeated attributes per
  request (`400 DUPLICATE_VARIANT_ATTRIBUTES`); repeated combinations per
  product (`409 DUPLICATE_VARIANT_COMBINATION`); reused SKUs
  (`409 SKU_ALREADY_EXISTS`, checked first to preserve the pre-existing
  error precedence; the DB unique constraint remains the race authority).
- Persists variant + mappings + zeroed inventory + structured audit in one
  `prisma.$transaction`; any failure rolls back, leaving no mapping-less
  variant.
- Returns the variant with its mappings (same shape as admin detail).
- RBAC unchanged (`requireOperationsAccess`); product existence → 404.

Web client type `createAdminVariant` widened compatibly
(`AdminVariantAttributeInput`); no UI caller changes needed.

## 7. Attribute Mapping Integrity

Resolution never invents vocabulary: unknown references fail closed, values
must belong to the stated attribute, and the cross-variant combination
check uses the canonical sorted `(attributeId, attributeValueId)` identity
— the same identity the generate engine uses (SKU text stays output, never
identity).

## 8. Publish Readiness Regression

`checkPublishReadiness` and its enforcement are byte-for-byte unchanged.
Regression proof (new test): a directly-inserted mapping-less ACTIVE
variant blocks publish with `MISSING_ATTRIBUTES`; after backfilling its
mapping, the same product publishes (then restored to DRAFT). Pre-existing
gate suites (`product-lifecycle` 14/14, readiness units, generate/batch/
barcode suites) pass unmodified except `catalogue.test.ts`, whose fixture
was updated to use distinct attribute values per variant — the old fixture
reused one value for every variant, which only worked because mappings
were dropped (the test encoded the bug).

## 9. Browser Validation

NOT VERIFIED — ENVIRONMENT NOT AVAILABLE. No browser automation exists in
this environment (no Playwright/Cypress/Puppeteer harness). A reproducible
checklist (workflow, console/network audit, known-defect patterns) is
recorded in the validation matrix. Static contribution only: `grep` over
`app/admin/products` finds no live `params.then`, `sessions.filter`,
`window.confirm`, hydration markers, or merge conflicts — the single
`null.value` hit is a comment documenting the React event-pooling guard.
`npm run build` compiles all 60 routes (exit 0).

## 10. Accessibility Validation

NOT VERIFIED — keyboard/AT execution requires a browser. Static
spot-check only: product workspace uses real `<label>`s,
`aria-labelledby` sections, `aria-label` controls, `role="status"` live
regions, and the single `useModalFocus` / `JBConfirmDialog` primitives.
Automated a11y testing was not mistaken for AT validation.

## 11. Responsive/Device Validation

NOT VERIFIED — ENVIRONMENT NOT AVAILABLE. Breakpoint sweep (320–1920) and
focus areas (variant editor usability narrow, overflow, dialogs, sticky
actions) recorded as a checklist in the matrix.

## 12. Cloudinary Byte-Upload Validation

- Provider byte path: PASS. A throwaway runtime probe (outside the repo)
  uploaded a 70-byte 1px PNG to `jb-mercantile/products/`, returned
  `public_id / secure_url / png / 1×1 / 70 B`, and destroyed the asset
  (`{"result":"ok"}`) — no asset left behind, no credentials logged.
- Persistence/metadata path: PASS via automated suites (CRUD, primary,
  reorder, replace, provider-failure, orphan cleanup).
- Browser direct-upload bytes: NOT VERIFIED — ENVIRONMENT NOT AVAILABLE
  (SDK probe ≠ browser file-picker upload).
- Security: PASS — `sign-upload` returns `apiKey` + `signature`, never the
  secret; product uploads are operations-only; foreign publicIds are
  rejected before any provider call; uploaded URLs must be trusted
  Cloudinary HTTPS delivery URLs.

## 13. Automated Tests

- New `apps/api/src/routes/variant-manual.test.ts` (12 tests): valid
  creation via both attribute forms with DB + response + structured-audit
  assertions; missing mappings (ACTIVE and INACTIVE) with no-op proof;
  unknown id / unknown value-string / cross-attribute rejection with
  rollback proof; duplicate combination; duplicate SKU; duplicate
  attribute in one request; auth matrix; publish-blocked-then-unblocked
  lifecycle.
- Updated `apps/api/src/routes/catalogue.test.ts` (fixture now uses
  distinct attribute values per variant; same assertions, bug-encoding
  removed).
- Full repo suite: **56 files / 458 tests pass** (was 55 / 446).
- `npm run typecheck` (api + web): pass. `npm run lint`: 0 errors
  (1 pre-existing api warning in untouched `storefront.ts`; pre-existing
  web `<img>` warnings). `npm run build` (api + web): pass, exit 0, 60/60
  pages (prerender API-fetch warnings are environmental — no API server
  runs during build — with graceful fallbacks).
- `git grep` for merge markers: empty. Touched-path grep for
  `any / ts-ignore / TODO / FIXME / fake`: clean.

## 14. Security Findings

- No RBAC change; all variant endpoints remain operations-gated (401/403
  re-tested). No mass-assignment change (zod strips unknown keys; SKU
  stays immutable on PATCH).
- No secrets in audit payloads (asserted in-test by shape + serialization
  scan). No credentials in logs (probe printed metadata only).
- Cloudinary secret remains server-side by construction; customer
  product-upload escalation denied and tested.
- No transactional history deleted (fixtures cleaned with targeted
  deletes only).

## 15. Remaining Limitations

1. Browser / AT / physical-device validation not performed (checklists
   provided; needs a real environment + manual pass).
2. Browser direct-upload byte path not exercised (provider byte path
   proven; signed-upload config proven; the browser leg needs a manual
   pass).
3. Historical mapping-less variants (if any exist in production data)
   still fail readiness until mappings are backfilled — correct behavior,
   worth a release note; there is no admin API to add mappings to an
   existing variant (backfill is direct-DB or regenerate).
4. Pre-existing `.env.example` tunnel-URL edit (trycloudflare) found in the
   tree is unrelated to this remediation and was left untouched.
5. `weight` remains an accepted-but-unpersisted manual-variant field
   (pre-existing; `ProductVariant` has no weight column — changing that
   would need the migration this phase deliberately avoids).

## 16. Evidence

- `npm run typecheck` (api + web): pass.
- `npm run lint`: 0 errors (pre-existing warnings only).
- `npm test`: 56 files / 458 pass.
- `npm run build`: pass (exit 0; 60/60 pages).
- Cloudinary probe: 70 B PNG round-trip + destroy `ok` (throwaway script
  outside repo; asset cleaned up).
- `git grep -n -E '^(<<<<<<<|=======|>>>>>>>)'`: empty.
- `git diff --check`: clean (verified at each change).
- `git diff --stat -- prisma/`: empty (no migration).

## 17. Final Status

```text
V8-RC LIMITATIONS REMEDIATION STATUS

Schema migration strategy: PASS (no migration; client compatibility proven at runtime)
PRODUCT_UPDATED structured payload strategy: PASS (existing VARIANT_CREATED reused; backwards-compatible additive payload)
Manual POST /variants attribute mapping: PASS
Publish readiness regression: PASS
Browser validation: NOT VERIFIED — ENVIRONMENT NOT AVAILABLE
Accessibility validation: NOT VERIFIED — ENVIRONMENT NOT AVAILABLE (static spot-check only)
Responsive/device validation: NOT VERIFIED — ENVIRONMENT NOT AVAILABLE
Cloudinary byte-upload: PARTIAL (provider bytes PASS via runtime probe; browser direct-upload NOT VERIFIED)
Automated regression tests: PASS (56 files / 458 tests)
Documentation: PASS
```

Files changed (this phase):

- `apps/api/src/routes/catalogue.ts` (flexible attribute input, resolver,
  combination + SKU-precedence checks, atomic persistence, structured
  `VARIANT_CREATED` audit, mappings in response)
- `apps/api/src/routes/variant-manual.test.ts` (new, 12 regression tests)
- `apps/api/src/routes/catalogue.test.ts` (fixture uses distinct attribute
  values per variant)
- `apps/web/lib/admin-api.ts` (`AdminVariantAttributeInput` client type)
- `docs/V8-RC-ARCHITECTURE-NOTES.md` (new)
- `docs/V8-RC-VALIDATION-MATRIX.md` (new)
- `docs/V8-RC-LIMITATIONS-REMEDIATION-REPORT.md` (this file)
- `docs/CATALOGUE.md`, `docs/API.md`, `docs/README.md` (manual-create
  contract notes + index)

Database migrations: none (intentionally — see §4).
