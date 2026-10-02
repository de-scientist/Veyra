# V8-RC Validation Matrix — JB Mercantile

Statuses: `PASS` / `PARTIAL` / `BLOCKED` / `NOT VERIFIED`. No numerical scores.
`NOT VERIFIED — ENVIRONMENT NOT AVAILABLE` is stated explicitly wherever the
environment, not the code, is the limit. Automated test success is never
recorded as browser, assistive-technology, or physical-device validation.

## Automated regression (executed 2026-10-02, live PostgreSQL `localhost:5432`)

| Area | Test | Environment | Expected | Observed | Evidence | Status |
| ---- | ---- | ----------- | -------- | -------- | -------- | ------ |
| Variant API | Valid manual variant persists mappings (legacy + id forms) | `vitest` headless + real DB | `ProductVariant` + `VariantAttributeValue` rows + mappings in response | 2 creation tests pass; row counts asserted in DB | `apps/api/src/routes/variant-manual.test.ts` (12/12 pass) | PASS |
| Variant API | Missing mappings rejected, nothing persisted | `vitest` + real DB | `400 VARIANT_ATTRIBUTES_REQUIRED`, variant count unchanged | Rejected for ACTIVE and INACTIVE; SKU absent afterwards | `variant-manual.test.ts` | PASS |
| Variant API | Invalid / foreign attribute values rejected, rollback | `vitest` + real DB | 400, no variant row | `ATTRIBUTE_VALUE_NOT_FOUND` / `INVALID_VARIANT_ATTRIBUTES`; `findUnique(sku)` null | `variant-manual.test.ts` | PASS |
| Variant API | Duplicate combination rejected | `vitest` + real DB | `409 DUPLICATE_VARIANT_COMBINATION` | 409 with code; no row created | `variant-manual.test.ts` | PASS |
| Variant API | Duplicate SKU rejected (precedence over combination) | `vitest` + real DB | `409 SKU_ALREADY_EXISTS` | 409 with code | `variant-manual.test.ts` + `catalogue.test.ts` | PASS |
| Variant API | Unauthorized creation rejected | `vitest` + real DB | 401 guest / 403 customer | 401 / 403 | `variant-manual.test.ts` | PASS |
| Publish readiness | Malformed variant blocks publish; backfilled variant unblocks | `vitest` + real DB | 400 `MISSING_ATTRIBUTES`, then 200 publish | `variants[2].attributes / MISSING_ATTRIBUTES`, then ACTIVE, then restored DRAFT | `variant-manual.test.ts` | PASS |
| Publish readiness | Pre-existing gate suites unaffected | `vitest` + real DB | All pass | `product-lifecycle` 14/14, readiness unit tests pass | `product-lifecycle.test.ts`, `catalog.test.ts` | PASS |
| Events | `VARIANT_CREATED` structured payload, no secrets | `vitest` + real DB | `after` has entity/productId/operation/variantId/sku/price/mappings; no secret material | Shape asserted; serialized payload scanned for secret/password/token | `variant-manual.test.ts` | PASS |
| Events | Existing consumers unaffected | static + suite | No new enum value; barcode `VARIANT_UPDATED` paths untouched | `barcode.test.ts` passes; `git diff` shows no `AuditAction` change | suite + diff | PASS |
| Media | ProductImage persistence / primary / ordering / deletion / authz | `vitest` + real DB | Pass | Pre-existing suites pass unmodified | `product-media.test.ts`, `media.test.ts`, `cloudinary.test.ts`, `policy.test.ts` | PASS |
| Media | Cloudinary failure paths (unconfigured, invalid, oversized, orphan cleanup) | `vitest` (mocked provider) + code | Clear errors, retry possible, no fake success | Suites pass; `MEDIA_NOT_CONFIGURED` 503 fail-safe verified | `media.test.ts`, `product-media.test.ts` | PASS |
| Prisma/client | Schema = DB = client (no migration) | repo + live DB | No `prisma/` diff; suites exercise all touched tables | `git diff` clean under `prisma/`; CLI `validate` absent (8.0.0-rc.15) so no CLI path attempted | git + suite | PASS |
| Code quality | No new suppressions / temp workarounds on touched paths | `grep` + typecheck | No `any`/`ts-ignore`/`TODO` introduced | `catalogue.ts` grep clean; `typecheck` passes | grep + `tsc --noEmit` | PASS |
| Contracts | API error envelope preserved | suite | `{ success, error: { code, message, details, requestId } }` | `contracts.test.ts` passes | full suite | PASS |

## Cloudinary byte-upload (runtime probe 2026-10-02)

| Area | Test | Environment | Expected | Observed | Evidence | Status |
| ---- | ---- | ----------- | -------- | -------- | -------- | ------ |
| Provider bytes | 1px PNG (70 B) upload → metadata → destroy | Node runtime + live Cloudinary (`dwbqjzdvb`, `jb-mercantile/products/`) | `public_id`, `secure_url`, dimensions, format, bytes; cleanup `ok` | `png 1×1, 70 B` round-tripped; `destroy → {"result":"ok"}`; no asset left behind | Throwaway probe script (outside repo; creds never logged) | PASS |
| Persistence chain | Uploaded bytes → `ProductImage` row → retrieval → rendering | headless (no browser) | Row persisted from provider result; image renders | Metadata-persistence path covered by automated tests; end-to-end byte→row→render not executed headless | `product-media.test.ts`, `product-lifecycle.test.ts` | PARTIAL |
| Browser direct-upload bytes | File picker → signed direct upload → product media | Browser | Real file bytes uploaded via signed URL | No browser automation in this environment | — | NOT VERIFIED — ENVIRONMENT NOT AVAILABLE |
| Failure handling | Network / invalid / oversized / provider-error / DB-failure-after-upload | Browser + provider | Visible failure, safe data, retry, orphan cleanup | Automated provider-failure + orphan-cleanup paths pass; live browser failure drills not executed | `product-media.test.ts` (mocked) | PARTIAL |
| Security | Secret containment, authz, URL validation | static + suite | Secret server-side only; ops-only product uploads; ownership checks | `sign-upload` returns `apiKey`+`signature`, never `apiSecret` (`routes/media.ts`, `lib/media/cloudinary.ts`); customer product-upload denied; foreign publicIds rejected | `media.test.ts`, code inspection | PASS |

`Cloudinary signing/configuration works ≠ actual image bytes successfully uploaded`:
signing is PASS (suite); actual bytes are PASS at provider level (probe) but
NOT VERIFIED through the browser direct-upload path.

## Browser validation (product workflow)

Reproducible checklist for `/admin/products/new`, `/admin/products/[id]`,
and the storefront PDP after publish — **not executed here** (no browser /
device automation in this environment):

Page loading · product creation · field validation · media upload · image
preview · primary image · image ordering · variant creation · attribute
selection · SKU · pricing · inventory · collections · save · refresh ·
publish · error / loading / retry states · navigation · theme switching ·
console (errors, React/hydration warnings, 4xx/5xx, CORS, Cloudinary
failures) · known-defect patterns (`null.value`, `params.then`,
`sessions.filter`, `Hydration failed`, merge markers).

| Area | Test | Environment | Expected | Observed | Evidence | Status |
| ---- | ---- | ----------- | -------- | -------- | -------- | ------ |
| Browser workflow | Checklist above | Chromium/Firefox/Safari (manual) | No new runtime errors | Not executed | — | NOT VERIFIED — ENVIRONMENT NOT AVAILABLE |
| Browser console | Console/Network audit incl. known-defect patterns | Browser devtools | Zero new errors/warnings | Static grep only: single `null.value` hit is a code comment documenting the guard (`[id]/page.tsx:43`); no `params.then`, no `window.confirm`, no markers | `grep` over `app/admin/products` | PARTIAL (static only) |
| Build/compile | Web production build compiles all product routes | `npm run build` | Pass | Pass (see remediation report) | build log | PASS |

## Responsive / device validation

Breakpoints to cover when emulation or hardware is available: 320 · 360 ·
375 · 390 · 414 · 480 · 768 · 820 · 1024 · 1280 · 1440 · 1920 — product
creation workspace, media grid, variant table, attribute controls, sticky
actions, validation errors, upload controls, navigation/sidebar, horizontal
overflow, modal/dialog behavior (variant editor must stay usable narrow).

| Area | Test | Environment | Expected | Observed | Evidence | Status |
| ---- | ---- | ----------- | -------- | -------- | -------- | ------ |
| Responsive/device | Breakpoint sweep above | Emulation / physical devices | Usable variant editor, no overflow | Not executed | — | NOT VERIFIED — ENVIRONMENT NOT AVAILABLE |

## Accessibility validation

Keyboard (Tab / Shift+Tab / Enter / Space / Escape / arrows) · visible
focus + logical order · dialog focus trap + restoration, no traps · form
labels, required states, error association (`aria-invalid` /
`aria-describedby`), accessible names (no placeholder-only controls) ·
keyboard-operable upload controls · labelled attribute selectors. Static
spot-check: product workspace uses real `<label>`s, `aria-labelledby`
sections, `aria-label` controls, `role="status"` live regions, and the
single `useModalFocus` / `JBConfirmDialog` primitives — but static markup
is not a substitute for keyboard/AT execution.

| Area | Test | Environment | Expected | Observed | Evidence | Status |
| ---- | ---- | ----------- | -------- | -------- | -------- | ------ |
| Keyboard/focus/forms | Checklist above | Browser keyboard-only | Full operability | Not executed | — | NOT VERIFIED — ENVIRONMENT NOT AVAILABLE |
| Assistive technology | NVDA + Chromium (or available combo): landmarks, headings, labels, errors, buttons, image/variant controls, status + dialog announcements | AT environment | Pass | No AT in this environment | — | NOT VERIFIED — ASSISTIVE TECHNOLOGY ENVIRONMENT UNAVAILABLE |
