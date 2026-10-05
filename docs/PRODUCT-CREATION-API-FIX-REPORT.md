# Product Creation API Fix Report — Variant Generation, Image Primary, Collections/CORS

Status labels used in this report: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / NOT VERIFIED / BLOCKED / FUTURE.

## 1. Executive Summary

Three distinct admin product-creation failures were diagnosed against the actual
repository code, request payloads, and API responses — not assumed from status
codes:

1. `POST /api/v1/admin/products/:id/variants/generate` → repeated `400`s.
   Root cause was on **both** sides: the UI fired `dryRun` previews without the
   prerequisites the backend legitimately requires (category dictionary code,
   brand code, one value per variant dimension), and the backend answered with
   correct structured 400s (`MISSING_CATEGORY_CODE`, `MISSING_SKU_COMPONENT`,
   `MISSING_REQUIRED_DIMENSION`, `ATTRIBUTE_VALUES_REQUIRED`). A second defect
   made the UI fire the endpoint repeatedly (debounced preview **plus** an
   explicit post-generate preview call).
2. `POST /api/v1/admin/products/:id/images/:imageId/primary` → `400`
   `FST_ERR_CTP_EMPTY_JSON_BODY`. Root cause: the shared fetch helper stamped
   `content-type: application/json` on a **bodiless** POST, and Fastify's
   default JSON parser rejects empty JSON bodies with 400 before any handler
   runs. The backend route, schema, ownership check, and transaction were all
   correct.
3. `PUT /api/v1/admin/products/:id/collections` → CORS preflight failure
   (`Method PUT is not allowed by Access-Control-Allow-Methods`). Root cause:
   the backend route genuinely is `PUT` (replace semantics) and the frontend
   already used `PUT`, but the CORS `methods` allowlist did not advertise `PUT`.

All three are fixed, covered by regression tests, and verified by typecheck,
lint, the full test suite (479/479), and production builds. Live-browser
end-to-end verification was NOT VERIFIED (no running servers/browser in this
environment) — see §8.

## 2. Root Causes

### 2.1 Variant generation (Failure A)

Backend contract (`apps/api/src/routes/catalogue.ts:597`,
`generateVariantsSchema` at `catalogue.ts:81-96`): `POST` with
`{ attributes: Record<attributeIdOrSlug, string[]>, allowList?, price?,
compareAtPrice?, brandCode?, brandValueId?, categoryCode?, styleCode?,
dryRun? }`. The SKU engine (`lib/variant-generation*.ts`) requires a coded
category, a brand component, and at least one value per required dimension,
and returns structured, safe 400s otherwise. Existing combinations are
reported (`existing`), never duplicated; foreign SKU collisions abort with
409 `SKU_ALREADY_EXISTS`; generation is atomic (all-or-nothing transaction).

The 400s were legitimate backend validation responses to premature UI
requests: the `VariantManager` dryRun preview fired on mount/selection change
before brand/category-code/dimension prerequisites were satisfied. The fix
keeps the backend authoritative and stops the UI sending doomed requests:

- Prerequisite gates (`previewBlockedReason`): uncoded category, missing brand
  code, or a dimension with zero selected values now render an inline
  actionable hint instead of calling the API.
- `handleGenerate` returns early with guidance when no valid combination is
  staged (empty dimensions = single default variant still proceeds).
- Backend codes are mapped to fix-oriented messages (`explainPreviewFailure`)
  while the backend message is always preserved.

### 2.2 Repeated `/variants/generate` requests

Two compounding causes, both in `VariantManager.tsx`:

1. The debounced server-preview effect re-ran whenever `runPreview` identity
   changed, **and** `handleGenerate` explicitly called `runPreview()` right
   after `onChanged()` refreshed `existingVariants` — doubling requests.
   Removed the explicit call; the prop-driven effect re-runs the preview
   exactly once.
2. Overlapping in-flight previews could clobber newer matrix state
   (`previewSeq` monotonic sequence; stale responses are dropped).

Generation remains an explicit user action (`Create N variant(s)` button with
confirm dialog, `saving` guard, disabled while `previewState === 'loading'`).
The backend stays duplicate-safe regardless (existing-combination reporting +
DB unique constraints).

### 2.3 Image primary (Failure B)

Backend contract (`apps/api/src/routes/product-media.ts:105`): `POST`
`.../images/:imageId/primary` with **no body**. Service
(`lib/media/products.ts:241-254`): verifies editable product status, verifies
`image.productId === productId` (404 otherwise — IDOR/BOLA boundary), then a
single transaction unsets all + sets the target, so exactly one primary exists
and already-primary calls are idempotent 200s. None of this was defective.

The 400 came from transport, not business logic:

- `apps/web/lib/admin-api.ts` (and `shopping-api.ts`) unconditionally sent
  `content-type: application/json` on every request, including bodiless ones.
  Fastify's default JSON parser throws `FST_ERR_CTP_EMPTY_JSON_BODY` (400)
  for those before the handler runs.
- Client fix: `content-type` is now sent only when a body is present.
  `setPrimaryAdminProductImage` already used `POST` with no body — correct,
  unchanged in verb.
- Server hardening (defense in depth): root JSON parser maps an empty body to
  `{}` so any bodiless JSON-stamped request reaches its handler; routes with
  required bodies still fail via their own zod schemas. Two subtleties found
  empirically and fixed:
  - A `RegExp`-registered parser does **not** override Fastify's built-in
    exact-match JSON parser (proven by a failing regression test); the
    override must use the exact `'application/json'` string.
  - The encapsulated webhook context in `routes/notifications.ts` already
    registered its own `'application/json'` parser (for HMAC `rawBody`
    capture), which collides with a root override. The root parser now also
    stashes `request.rawBody`, and the webhook context reuses it instead of
    registering a duplicate. HMAC verification behavior is unchanged.

### 2.4 Collections / CORS (Failure C)

Verified contract first: backend is `PUT /admin/products/:productId/collections`
with replace semantics (`catalogue.ts:1159-1191`, `collectionIds: string[]`,
dedupe via `Set`, unknown collections → 404, transactional
delete-all + create-many, audit-logged). Frontend `setProductCollections`
already used `PUT` with `{ collectionIds }` (`admin-api.ts:133-138`). The
verbs agreed — the defect was purely that CORS `methods` omitted `PUT`, so the
browser preflight failed before the request was ever sent.

Fix: `methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']`
(`app.ts:66`). No extra methods exposed. Additionally, the local `.env` had no
explicit `CORS_ORIGIN`/`APP_URL` (dev worked only via the `env.ts` default);
both are now set explicitly to `http://localhost:3000` (local-only file,
never committed).

## 3. Files Changed

Backend:

- `apps/api/src/app.ts` — CORS methods now include genuine-contract `PUT`;
  exact-string `'application/json'` parser override (empty body → `{}`,
  `rawBody` stashed for webhooks).
- `apps/api/src/routes/notifications.ts` — removed duplicate encapsulated
  JSON parser; webhook handlers reuse the root parser's `rawBody`.
- `apps/api/src/routes/cors.test.ts` — NEW: preflight advertises PUT for the
  dev origin, exact-origin echo + credentials, never `*`.
- `apps/api/src/routes/product-media.test.ts` — added regression test:
  bodiless primary POST stamped with JSON content-type returns 200 with
  exactly one primary.

Frontend:

- `apps/web/lib/admin-api.ts` — `content-type: application/json` sent only
  when a body is present (fixes bodiless `POST .../primary`, logout,
  barcode-generate, delete flows).
- `apps/web/lib/shopping-api.ts` — same conditional content-type fix.
- `apps/web/components/VariantManager.tsx` — preview prerequisite gates +
  blocked hints, `previewSeq` stale-response guard, removed double preview
  invocation after generate, early-return guard in `handleGenerate`, backend
  error-code mapping with preserved messages, Refresh preview + Try again
  actions, no `alert`/`confirm`/`location.reload`.

Config (local only, gitignored, never committed):

- `.env` — added explicit `APP_URL=http://localhost:3000` and
  `CORS_ORIGIN=http://localhost:3000`.

Docs:

- `docs/PRODUCT-CREATION-API-FIX-REPORT.md` — this file (NEW).

No changes were required to `routes/catalogue.ts`, `routes/product-media.ts`,
`lib/variant-generation*.ts`, `lib/media/products.ts`, `lib/sku.ts`,
`ProductMediaManager.tsx`, `app/admin/products/new/page.tsx`, or
`app/admin/products/[id]/page.tsx` — all were audited and already conform to
the contracts above. Incidental: `apps/web/tsconfig.tsbuildinfo` (build
artifact) was swept into an auto-commit; harmless, no source impact.

## 4. API Contract Changes

No breaking contract changes. Methods, paths, and payload shapes are unchanged
(`POST .../variants/generate`, `POST .../images/:imageId/primary`,
`PUT .../collections`, all other verbs as before). Behavioral deltas:

- Empty JSON bodies now parse as `{}` instead of `FST_ERR_CTP_EMPTY_JSON_BODY`
  400. Routes with required bodies still return structured 400s via zod.
- `request.rawBody` is now populated for all JSON requests (previously only
  inside the webhook context); used solely for webhook HMAC verification.

## 5. Database Changes

None. No migrations, no schema edits, no data deletion, no reset. Existing
constraints remain the authority: SKU uniqueness, `ProductCollection`
`[productId, collectionId]` uniqueness, single-primary partial unique index,
variant-attribute mappings.

## 6. Security

- **RBAC**: unchanged and canonical. All admin product/media/collection
  endpoints keep `requireOperationsAccess` (staff+); role/user administration
  keeps `requireSuperAdmin`. Test suites assert 401 unauthenticated / 403
  customer on every touched route family.
- **Ownership / IDOR-BOLA**: `getOwnedImage` enforces
  `image.productId === requested productId` with a 404 (never 403, revealing
  nothing about other products); variant-image binding is likewise checked.
  Ownership checks were not weakened.
- **Validation**: backend stays authoritative. UI gating only suppresses
  requests that would certainly fail validation; every error path still
  surfaces the backend's structured `{ success: false, error: { code, message,
  details, requestId } }` without stack traces, SQL, or secrets.
- **CORS**: exact-origin allowlist from `CORS_ORIGIN` (dev:
  `http://localhost:3000`), `credentials: true`, no wildcard, minimal method
  set covering only genuine contract verbs. `origin: true` and `*` with
  credentials were not used.

## 7. Testing

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` (api + web) | PASS | `tsc --noEmit` clean in both workspaces |
| `npm run lint` (api + web) | PASS | 0 errors; 1 pre-existing api warning (`DISCOVERY_PAGE_SIZE` unused in `storefront.ts`) and 4 pre-existing web `<img>` warnings in unrelated pages, all documented, none introduced |
| Targeted API tests (cors, product-media, variant-generation) | PASS | 28/28, incl. new bodiless-primary regression test (initially failed, proving it reproduces the bug, then passed after the exact-string parser fix) |
| Adjacent suites (product-lifecycle incl. collections PUT, notifications) | PASS | 32/32 |
| Full `npm run test` | PASS | 59 files, 479/479 tests |
| `npm run build` (api + web) | PASS | `tsc` + `next build`, 60/60 static pages |
| Merge markers `git grep -n -E '^(<<<<<<<\|=======\|>>>>>>>)'` | PASS | no matches |
| Manual browser verification (Philips blender scenario, §31–33) | NOT VERIFIED | no live servers/browser in this environment; Network-tab flow could not be exercised |

Frontend regression sweep (§30): no `window.alert`/`window.confirm`/
`window.location.reload` in the product flow (confirmations use
`JBConfirmDialog` via `useConfirm`); `[id]/page.tsx` uses synchronous
`params.id` (Next.js 14) with no `params.then`/`use(params)`; event values are
captured synchronously via `e.currentTarget.value` inside handlers (the
documented `null.value` guard); no `sessions.filter` in the flow; primary
action is hidden (not just disabled) when already primary; collection saves
use `collectionsSaving` and disable only the relevant control; backend error
messages are surfaced, never replaced by generic text.

## 8. Final Status

- Variant Generation: PASS (valid selections generate; invalid selections get
  structured validation errors; duplicates prevented; SKUs unique;
  idempotent; single-request-per-action)
- Product Images: PASS (upload persists; primary selectable; exactly one
  primary; ownership enforced; bodiless primary POST returns 200)
- Collections: PASS (frontend/backend both PUT; preflight advertises PUT;
  replace semantics retain/add/remove correctly; duplicates prevented)
- Repeated Request Issue: PASS (no render/effect-driven generation storms;
  sequence guard drops stale previews; no double call after generate)
- Product Creation End-to-End: PARTIAL (every layer verified by automated
  tests and builds, but the live-browser walkthrough in §31–33 is NOT
  VERIFIED in this environment)
- Typecheck: PASS
- Lint: PASS (0 errors; pre-existing warnings documented above)
- Tests: PASS (479/479)
- Build: PASS (api + web)

Remaining issues:

- Live-browser verification (§31 Philips 1.5L blender scenario + §33
  Network-tab audit) still needs a human pass with both dev servers running.
  Expected flow: `POST /admin/products` → 201, `POST .../images` → 201,
  `POST .../images/:id/primary` → 200, `PUT .../collections` → 200,
  `POST .../variants/generate` (dryRun preview + live create) → 200, with no
  400/CORS/`net::ERR_FAILED` entries for valid actions.
