# Product UI Route Fix Report — Dynamic `params` Contract, Product Creation Overhaul, Cloudinary Media, Hero Carousel

Status labels: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT VERIFIED (per AGENTS.md).

## 1. Runtime Error

Original:

```text
Uncaught TypeError: params.then is not a function
Storefront route error: params.then is not a function
```

The second line is logged by the storefront error boundary (`apps/web/app/error.tsx` → `console.error('Storefront route error:', error.message)`) when any child route throws the first error.

## 2. Root Cause

Installed stack (verified in `apps/web/package.json`): **Next.js 14.2.15, React 18.3.1**. In Next.js 14, dynamic-route `params` is a **synchronous plain object** (`{ id }`, `{ slug }`, `{ orderNumber }`, …). It is only a `Promise` in Next.js 15+.

Two client pages used Next-15-style Promise handling against the Next-14 runtime, so `.then` was called on a plain object:

1. `apps/web/app/account/orders/[orderNumber]/tracking/page.tsx` — typed `params: { orderNumber: string }` (correct) but the effect ran `params.then(({ orderNumber }) => …)` (incorrect).
2. `apps/web/app/account/returns/[returnId]/page.tsx` — typed `params: Promise<{ returnId: string }>` and ran `params.then(({ returnId }) => …)` (both incorrect on Next 14).

`params.then` on a non-Promise object throws `TypeError: params.then is not a function`, which the error boundary surfaced as `Storefront route error: …`.

## 3. Affected Routes

Audited every page under `apps/web/app/` (all `[id]`, `[slug]`, `[orderNumber]`, `[returnId]` routes, layouts, `error.tsx`).

| Route | params contract (Next 14.2.15) | Usage found | Fix |
| --- | --- | --- | --- |
| `/account/orders/[orderNumber]/tracking` | sync `{ orderNumber }` | `params.then(...)` | IMPLEMENTED — direct `routeOrderNumber` use |
| `/account/returns/[returnId]` | sync `{ returnId }` | `Promise<…>` type + `params.then(...)` | IMPLEMENTED — sync type + direct use |
| `/admin/products/[id]` | sync `{ id }` | already correct (`params.id`) | No change to params handling; layout/variant-attribute UX improved |
| `/admin/users/[id]`, `/admin/customers/[id]`, `/admin/orders/[orderNumber]`, `/account/orders/[orderNumber]`, `/order-confirmation/[orderNumber]` | sync | already correct | No change |
| `/products/[slug]`, `/categories/[slug]`, `/collections/[slug]` (server) | sync | already correct (`params.slug`) | No change |

`searchParams` was audited too: server pages type it as a plain object and treat it as one — no Promise misuse found. No `React.use(params)` / `await params` anywhere. A permanent regression guard was added: `apps/web/lib/route-params.test.ts` scans every App Router page for `params.then`, `params: Promise<`, `await params`, `use(params)`.

## 4. Fix

- Tracking page: effect now calls `getOrderTracking(routeOrderNumber)` directly; dep is `routeOrderNumber`.
- Return-detail page: prop type corrected to `params: { returnId: string }`; effect calls `getAccountReturnDetail(routeReturnId)` directly.
- Server/client boundaries preserved: both stay Client Components (they were already client-side fetchers); server pages, `notFound()`, metadata, loading/error boundaries untouched.
- Backend correction discovered during the product-flow audit (required to make variant creation possible at all): `POST /admin/products/:productId/variants` validated against `images: []` hardcoded, so **every** first-variant request failed with `Product media is required before publishing` even when images existed. The route now counts the product's real `ProductImage` rows and validates variant-level readiness (SKU, price, attributes, product basics) while the media requirement stays enforced at publish time via `validateCatalogProduct`. File: `apps/api/src/routes/catalogue.ts`.

## 5. Product Creation (`/admin/products/new`)

Rebuilt as a draft-first workspace (`apps/web/app/admin/products/new/page.tsx` + `apps/web/lib/product-publish.ts`):

- Header: Back to Products, title/description, **Save Draft** + **Create Product** (disabled while saving / after creation, `aria-busy`, no duplicated primary-action confusion).
- §1 Basic Information: name, slug (auto-generated with the backend's `generateSlug` algorithm, editable), category (live), description, status. Zod validation mirrors backend `productSchema`; inline field errors + summary alert.
- §2 Product Media: locked explainer before the draft exists; the real `ProductMediaManager` (signed Cloudinary workflow) embeds immediately after draft creation. No second upload path.
- §3 Variants & Pricing: SKU / name / price / compare-at / attribute + value; attribute required (backend requires ≥1 attribute value per variant).
- §4 Categories & Collections: category from §1; collections listed from the live API with an honest note (no product↔collection assignment endpoint exists, so membership stays in the Collections admin area — nothing invented).
- §5 Attributes: dynamic list from `getAdminAttributes` (Fashion/Footwear/Kitchen examples in help text only; nothing hard-coded).
- §6 SEO: slug + title/description search preview (derived fields only — the backend has no SEO columns, so none were invented).
- §7 Review & Publish: live checklist mirroring `validateCatalogProduct` (name, slug, category, description, ≥1 variant, ≥1 image); Publish calls `PATCH status=ACTIVE` only when variant+image checks pass, then routes to the editor.
- Save experience: toasts (success/error), no `window.alert/confirm/prompt`, duplicate-submit guard, `beforeunload` unsaved-changes warning (non-aggressive, draft phase only).

## 6. Cloudinary

Unchanged architecture, reused everywhere (`lib/media-upload.ts` → `ProductMediaManager`):

```text
Select file → client MIME/size validation → POST /media/sign-upload (authed)
→ XHR direct upload to Cloudinary (progress) → normalize/validate result
(publicId match, image type, https delivery URL, allowed format, dimensions, size)
→ POST /admin/products/:id/images (server re-validates, persists ProductImage)
→ gallery refresh
```

Secrets never leave the server; previews are never presented as saved images (queue states: queued/uploading/saving/success/error, retry + dismiss per item).

## 7. Product Media

Via the shared `ProductMediaManager` (used identically on `/new` post-draft and `/admin/products/[id]`):

- add (multi + drag-and-drop + keyboard browse button), preview/expand with dimensions/format/alt metadata, set primary (backend-consistent single-primary rule), reorder via Prev/Next buttons (keyboard/touch friendly, never drag-only), edit alt text (≤200 chars), delete (confirm dialog; honest Cloudinary-cleanup-failed messaging), replace (upload-then-commit, old asset untouched on failure), upload progress + per-item retry.
- Unauthorized users cannot upload: all media endpoints require operations access (401 unauthenticated / 403 customer — covered by existing `product-media.test.ts`) and ARCHIVED products are read-only.

## 8. Hero Carousel

- `apps/web/components/HeroCarousel.tsx` + `apps/web/lib/hero-slides.ts`: typed `HeroSlide` model (id, eyebrow, title, description, image, imageAlt, href, ctaLabel); three JB slides (Fashion / Footwear / Kitchen & Home) reusing existing department imagery and linking to real department discovery URLs. Static presentation config only — product grids remain DB-backed; no prices/discounts/claims/statistics; no third-party branding, assets, code, or copy.
- Behavior: prev/next arrows, dot indicators, keyboard (←/→/Home/End), 6s autoplay paused on hover/focus/visibility-hidden, `prefers-reduced-motion` disables autoplay, touch swipe, `aria-roledescription="carousel"`, labelled controls, polite status announcement.
- Responsive: two-column desktop → stacked mobile, `sizes`-aware `next/image`, `priority` on slide 1 only; homepage flow preserved (carousel → departments → featured/department picks → collections → new arrivals → trust strip → footer).

## 9. Tests

Executed (this environment, no live DB/API):

- `npm run typecheck --workspace @veyra/web` — PASS
- `npm run typecheck --workspace @veyra/api` — PASS
- `npm run lint --workspace @veyra/web` — PASS (only 4 pre-existing `<img>` warnings in untouched files)
- `npx vitest run apps/web/lib` — PASS (8 files, 31 tests; includes new `route-params`, `hero-slides`, `product-publish` suites)
- API pure suites (`catalog`, `media/policy`, `media/cloudinary`) — PASS (20 tests)
- `npm run build --workspace @veyra/web` — PASS (59 routes; catalogue `fetch failed` log lines during prerender are the pre-existing no-API-at-build fallback path, swallowed by `.catch(() => [])` — build succeeds)
- NOT VERIFIED here (require live Postgres/API + browser): DB-backed API suites (`catalogue.test.ts`, `product-media.test.ts`), E2E/browser flows (upload retry, multi-image, reorder, carousel responsive/keyboard on devices), RBAC click-paths. Backend authorization itself is unchanged and covered by existing server tests.

## 10. Remaining Issues

1. Collection↔product assignment has no backend endpoint, so the creation workspace can only display collections, not assign them. Needs a backend decision — NOT implemented by design (no fake API invented).
2. Product SEO title/description have no backend columns; the UI shows a derived preview only. Same reason as above.
3. Full browser/E2E verification (320–1920px, light/dark/system, screen reader pass, real signed Cloudinary upload against staging) still requires a running environment — code paths are the pre-existing tested ones, but the new composition is NOT VERIFIED in a browser here.
