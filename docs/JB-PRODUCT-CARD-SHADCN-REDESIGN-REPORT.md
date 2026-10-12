# JB Product Card shadcn Redesign Report — JB Mercantile

Status: IMPLEMENTED · Verified: web typecheck + lint + production build pass; 9 new lib tests pass; full suite 617/618 pass on first run (1 flaky API concurrency timeout, passes in isolation — see §9).
Date: 2026-10-12. Scope: product-card experience + directly contained interactions only. No cart, wishlist, auth, pricing, catalogue-model, schema, or API changes.

## 1. Initial audit findings

- Stack: Next.js 14.2.15, React 18.3.1, Tailwind 3.4.10, no `components.json`, no Radix/Sonner/CVA. shadcn/ui present as hand-built Tailwind-first primitives in `apps/web/components/ui/`: `card.tsx` (`UICard`/`UICardBody`/`UICardHeader`), `button.tsx` (`UIButton`), `badge.tsx` (`UIBadge`), `skeleton.tsx` (`Skeleton`), `tooltip.tsx` (CSS-only `Tooltip`), `sheet`, `separator`, `navigation-menu`, `breadcrumb`. No `alert.tsx`, no `sonner`, no `dialog`.
- Exactly ONE shared card already: `components/ProductCard.tsx` (server component + `ProductCardActions`/`WishlistButton` client islands), consumed by home (×5 sections, `eager` for LCP), shop, search, categories, collections, PDP related-products. Wishlist page uses its own rows (different context, untouched). Prior redesign report (`docs/PRODUCT-CARD-UI-UX-REDESIGN-REPORT.md`) already consolidated this — verified via grep (43 references, no duplicates).
- Canonical data flow: `lib/catalog.ts` shapes (`Product → ProductVariant → SKU → inStock`, `discountPercent`, `productInStock`, `ATTRIBUTE_REGISTRY`, KES `PriceDisplay` via `Intl en-KE`) fed by `lib/storefront.ts` (`toProduct` adapter over public `/catalog/*`, ISR 60s). Images via `ProductImage` (Cloudinary `thumbnail`/`detail` presets + legacy passthrough + branded fallback). Cart via `addToCart(variantId)` + `jb:cart-updated` event; wishlist via `lib/shopping-api.ts` with shared in-flight `GET` dedupe. Pure helpers in `lib/product-card.ts` (`cardBadge` priority out > sale > low > new, `quickAddVariant`, `lowStockQuantity` ≤5 display-only, `variantHint`, `cardColors`, `ratingSummary`) with 21 existing tests.
- Feedback before: bespoke `Toast.tsx` (`notify(type, message)` single-string, no titles) — no Sonner. Persistent messages: `.inline-message` divs and `JBAlert` in `JBLoading.tsx`. No competing toast library.
- Gaps found: card used bespoke `.product-card` CSS instead of shadcn `UICard`/`UIBadge`/`UIButton`; no reusable `ProductGrid`/empty/error components (each page hand-rolled `div.product-grid` + `div.empty-state`); no shadcn `Alert`; toasts lacked Title/Description structure; `ProductImage` had no loading skeleton; search fetch-failure used a plain `.inline-message` div.
- Constraint respected: no Next/React/Tailwind upgrades; no new dependencies added.

## 1b. Phase 0 gap matrix (evidence-based; inspected before implementing)

| Area | Existing implementation | Gap or defect | Required action |
| ---- | ----------------------- | ------------- | --------------- |
| Product card | Exactly ONE `components/ProductCard.tsx` (server component + `ProductCardActions`/`WishlistButton` islands); correct data flow, badge priority, quick-add rules, a11y labelling | Used bespoke `.product-card`/`.badge`/`.button` CSS instead of installed shadcn `UICard`/`UIBadge`/`UIButton`; badges/toasts not on shadcn primitives | **Improve** (adopt shadcn foundation; keep logic) |
| Product grid | No shared grid component — each page hand-rolled `div.product-grid` + `div.empty-state` (6 listing surfaces) | Duplicated grid/empty markup; no shared skeleton/error/retry states for grids | **Create** (`ProductGrid` + skeleton/empty/error; reuse `.product-grid` tokens) |
| Success/error feedback | Bespoke `Toast.tsx` (`notify(type, message)` single-string, no titles); `.inline-message` divs + `JBAlert`; no Sonner, no shadcn `Alert` | Toasts lacked Title/Description; no shared error mapper (raw backend messages could surface); search failure was a plain div | **Improve** toast (structured, deduped) + **Create** `UIAlert` + `product-feedback` mapper; **Keep** single-toast system (no Sonner — unjustified) |
| Cart and wishlist | `addToCart` + `jb:cart-updated` + shared-flight wishlist `GET`; busy guards; correct ownership (single notify per action) | Copy inconsistent with spec titles; error messages not normalised | **Improve** (structured copy + mapper; keep APIs, events, guards) |
| Storefront integration | Home (5 sections), shop, search, categories, collections, PDP related — all on the ONE card; same `storefront.ts` source | Pages used raw `div.product-grid`/custom empty states instead of shared grid | **Consolidate** (migrate 6 surfaces to `ProductGrid`; keep each page's fetching/filter/sort/pagination/SEO) |
| Tests | 21 `product-card` lib tests; no feedback-mapper tests; vitest covers only `apps/web/lib/**/*.test.ts` (no RTL) | Mapper untested; component JSX not unit-testable without new deps | **Create** `product-feedback.test.ts` (9 tests); no RTL added (deliberate) |

Implementation-plan decisions: **Keep** — data layer, cart/wishlist APIs + events, badge/variant/stock helpers, `PriceDisplay`, `ProductImage` delivery, route-level `DiscoverySkeleton`/`JBLoading`, per-page fetching/pagination/SEO. **Improve** — card (shadcn foundation), toasts, cart/wishlist copy, `ProductImage` loading state, `UIButton` (additive exporter). **Consolidate** — 6 listing surfaces onto `ProductGrid`. **Create** — `ProductGrid`, `UIAlert`, `product-feedback` (+tests). **Investigate** — none remained; wishlist-page rows and PDP `ProductActions` verified as legitimately separate contexts (list rows vs cards; PDP configurator vs card quick-add) and left untouched.

## 2. Existing components reused

- `UICard`/`UICardBody` (card foundation), `UIBadge` + `badgeToneFor`, `UIButton`, `Skeleton`, `Tooltip`, `cn()`, JB theme tokens (`--jb-*`, light/dark `data-theme`), `.product-grid` responsive layout, `PriceDisplay` (KES), `ProductImage` (Cloudinary presets), `ProductRating`, `JBIcon` (heart/cart/check — no emoji), `ToastProvider`/`useToast`, `addToCart`/`notifyCartUpdated`, wishlist API + `notifyWishlistUpdated`, `cardBadge`/`quickAddVariant`/`lowStockQuantity`/`variantHint`/`cardColors`/`ratingSummary`, `DiscoverySkeleton` route-level loading, pagination/filter/sort per page.

## 3. New or refactored files

- NEW `apps/web/lib/product-feedback.ts` — single ownership point for card feedback copy: `PRODUCT_SUCCESS` (Added to cart / Wishlist updated titles + descriptions per spec), `VARIANT_REQUIRED`, `toProductError(error, context)` mapper (UNAUTHENTICATED → Sign in required; OUT_OF_STOCK → Product unavailable; validation → safe message or generic; network → Unable to complete action + retryable; everything else → Something went wrong + retryable; unsafe SQL/stack/status fragments never surface; >160ch dropped). Plus `toProductErrorFromEnvelope` helper.
- NEW `apps/web/lib/product-feedback.test.ts` — 9 tests (copy, mapping, safe-verbatim, leak-guard, fallbacks, wishlist context).
- NEW `apps/web/components/ui/alert.tsx` — shadcn-compatible `UIAlert`/`UIAlertTitle`/`UIAlertDescription` over existing `.jb-alert` tokens (server-compatible; persistent inline messages only).
- NEW `apps/web/components/ProductGrid.tsx` — `ProductGrid` (role=list, stable product-id keys, `eagerCount`), `ProductCardSkeletonCard`/`ProductGridSkeleton` (shadcn `Skeleton` + card geometry), `ProductEmptyState` (default "No products found / Try changing your search…"), `ProductFetchError` (UIAlert + link/button retry).
- REFACTORED `components/ProductCard.tsx` — now `UICard` + `UICardBody` foundation with `UIBadge` tones (sale red, low amber, new blue, out neutral); identical commerce logic, badge priority, rating/colors/price/stock/hint, `useId` labelling, no nested interactives.
- REFACTORED `components/ProductCardActions.tsx` — `UIButton` (+ `uiButtonClasses` for the Choose-Options link), `Tooltip` on disabled OOS state, structured `notifyCard` success/error via `toProductError`, busy guard preserved.
- REFACTORED `components/WishlistButton.tsx` — `Tooltip` wrapper, structured toasts (`Wishlist updated` add/remove), `toProductError(..., 'wishlist')` (401 → Sign in required), shared-flight GET preserved.
- EXTENDED `components/Toast.tsx` — backward-compatible `notify(type, message, title?)` + new `notifyCard(type, title, description)`; title+description rendering; 500ms identical-toast dedupe (one notification per action); `role=status aria-live=polite`, no focus steal.
- EXTENDED `components/ui/button.tsx` — additive `uiButtonClasses()` exporter (no visual change; powers link-styled actions without nested interactives).
- EXTENDED `components/ProductImage.tsx` — skeleton overlay until `onLoad`, hides image pre-load to prevent flash, failure fallback unchanged.
- PAGES: `app/page.tsx`, `app/shop/page.tsx`, `app/search/page.tsx`, `app/categories/[slug]/page.tsx`, `app/collections/[slug]/page.tsx`, `app/products/[slug]/page.tsx` (related) — all render via `ProductGrid` + `ProductEmptyState`; search fetch-failure now `ProductFetchError` (UIAlert) instead of `.inline-message`.
- CSS `app/globals.css` — additive only: `.product-card__badge`, `.product-card__img-skeleton`, `.product-grid__item{min-width:0}`, `.toast__body/title/message`, reduced-motion guard. No token changes.

## 4. Product-card and grid design decisions

- One card, no variants: audit found no legitimate density difference; category/search/collection/home/related share `ProductCard`.
- Hierarchy preserved: image (4:5, cover, hover zoom, reduced-motion safe) → single `UIBadge` → wishlist overlay → dept · category → 2-line clamped title link (full name in `title`) → rating (real only) → color dots (≤4 +N, decorative + sr text) → KES price + struck compare-at → stock text (never color-only) → pinned action (`margin-top:auto`, full-width, 44px targets).
- Grid: existing `.product-grid` tokens (4 cols desktop, 3 in discovery layout, responsive down; `minmax(0,1fr)` + `product-grid__item{min-width:0}` → no 320px overflow). Filters/sort/pagination untouched per page.

## 5. Success and error alert behaviour

- Ownership: mutation owner emits exactly one toast per completed action (`ProductCardActions`, `WishlistButton`); 500ms dedupe collapses hook+caller double-fires; nothing on initial render/cancel.
- Success (only after backend confirms): Added to cart / "Product added to your cart successfully."; Wishlist updated / added/removed wording. Toast shows bold title + muted description, auto-dismiss ~4s, `aria-live=polite`.
- Error via `toProductError`: Sign in required / Product unavailable / Choose an option / Unable to add product (+ safe backend detail or generic) / Unable to complete action (retryable) / Something went wrong (retryable). No stack/SQL/status internals; retry only for network/server; card + page state preserved; rapid clicks guarded by `busy`.
- `UIAlert` reserved for persistent inline states (fetch failures); toasts for transient confirmations; no `AlertDialog` added (cart add needs no confirmation).

## 6. Loading, empty, and image-failure states

- Route loading unchanged (`DiscoverySkeleton`/`JBLoading` via `loading.tsx`).
- New `ProductGridSkeleton` (card-geometry skeletons, polite announcement, no fake products) for client-side use.
- Empty ≠ failure: `ProductEmptyState` ("No products found…", optional Browse-all action) vs `ProductFetchError` (UIAlert, "Search unavailable / Products unavailable", retry link/button, filter state preserved).
- Image: skeleton until load, branded "JB Mercantile" fallback with product-name aria-label, single attempt (no retry loop), card never marked unavailable for image failure, dimensions reserved (aspect-ratio + width/height → no layout shift).

## 7. Accessibility improvements

- `article[aria-labelledby]` with per-instance `useId`; image link `tabIndex=-1` so title link is the single nav stop; no nested interactives.
- Named actions per product (Add/Choose/Out-of-stock/Wishlist labels include product name); icon-only wishlist has `aria-label` + `aria-pressed` + `Tooltip`; `aria-busy` + disabled during loads; visible `:focus-visible` rings (inherited + UIButton); stock/rating communicated by text, never color alone; toasts `role=status` without focus theft; reduced-motion neutralises hover zoom/shimmer; 44px touch targets.

## 8. Data integrity and inventory safeguards

- All data from live `storefront.ts` adapter; no mock arrays, no invented ratings/discounts/stock; badges from authoritative `compareAtPrice` math / `availableQuantity` / `newArrival` flag only.
- Purchase authority stays backend: `quickAddVariant` allows only single in-stock variants; multi-variant → PDP; OOS → disabled UI + backend validation still enforced; cart is not reservation (checkout rules untouched); no optimistic state (write-through + reconcile on failure); unpublished/restricted products never exposed (visibility stays API-side); no schema/API/route changes.

## 9. Tests and commands executed

- `npm run typecheck --workspace=@veyra/web` — PASS (after fixing typed-route `href` casts in `ProductGrid`).
- `npx vitest run apps/web/lib/product-feedback.test.ts apps/web/lib/product-card.test.ts` — 30/30 PASS (9 new + 21 existing).
- `npm test` (full) — first run: 617 passed / 1 failed (`apps/api commerce inventory concurrency` 5s timeout, unrelated API timing test); rerun `npx vitest run apps/api/src/routes/commerce.test.ts` — 16/16 PASS (flaky under full-suite load, NOT a regression from this frontend-only change).
- `npm run lint --workspace=@veyra/web` — 0 errors; 4 pre-existing `<img>` warnings (account/cart/wishlist, untouched).
- `npm run build --workspace=@veyra/web` — PASS (all product/shop/search/category/collection routes built).
- Re-verified on final source (phased-strategy pass, report-only changes since): typecheck PASS, targeted tests 30/30 PASS, lint 0 errors (same 4 pre-existing `<img>` warnings), production build PASS.

## 10. Test results and build/type-check status

- IMPLEMENTED + TESTED: card renders from real data (logic covered by existing `product-card` tests + prior PDP adapter); badge/priority/quick-add/low-stock/variant-hint/colors/rating helpers (21 tests); feedback mapper + leak-guard (9 tests); typecheck/lint/build green.
- NOT unit-covered (no RTL in repo, no new deps added): JSX rendering of `ProductCard`/`ProductGrid`/toasts — verified by typecheck + production build only.

## 11. Known limitations and unresolved issues

1. No React component-test harness (vitest includes only `apps/web/lib/**/*.test.ts`; `@testing-library` not installed — deliberately not added). Card/grid/toast JSX is build-verified, not interaction-tested.
2. `Only X left` ≤5 threshold is presentational over authoritative quantities (`LOW_STOCK_THRESHOLD`, pre-existing, documented).
3. Products without reviews show no rating row (intentional, pre-existing).
4. Wishlist guest behaviour surfaces the backend's message via the mapper (401 → "Sign in required"); no second wishlist store.

## 12. Browser/E2E verification status

**NOT VERIFIED** — no browser/E2E tooling available in this environment. No visual, keyboard-walkthrough, screen-reader, or device testing performed. Responsive/contrast/focus claims are code-inspection only (tokens + `minmax(0,1fr)` + 44px targets). Do not treat as visually signed off.

## 13. Dependencies added

None. Zero new packages (Sonner/Radix/CVA deliberately not introduced — bespoke `Toast` + CSS `Tooltip` already satisfy the spec on Next 14/React 18 with no added bundle weight).

## 14. Phase completion gates (Phase 1–5)

- Phase 1 (shared card): PASS — one canonical `ProductCard` on `UICard`; typing/rendering via typecheck + build; no duplicates remain (grep: single definition; wishlist rows + PDP actions documented as separate contexts).
- Phase 2 (shared grid): PASS — `ProductGrid` renders real data on all 6 surfaces; loading (route skeletons retained + new `ProductGridSkeleton`), empty (`ProductEmptyState`), failed-fetch (`ProductFetchError` + retry) states present; `DiscoverySkeleton`/`JBLoading` skeletons retained deliberately for route-level loading (not duplicates — different layer).
- Phase 3 (feedback): PASS — single-owner toasts (dedupe verified by test-adjacent logic + code inspection); success only post-confirmation; errors mapped + leak-guarded (9 tests); rapid-click guards retained; no hook/caller double-notify (sole emitter per action + 500ms collapse).
- Phase 4 (integration): PASS — home, shop, search, categories, collections, PDP-related all use `ProductGrid`/`ProductCard`; fetching, filters, sort, pagination, SEO, routing, variants, pricing untouched; remaining `product-grid` divs exist only inside skeleton/grid components (layout owners, not duplicates).
- Phase 5 (regression): PASS except pre-existing/flaky notes in §9 — typecheck, lint (0 errors), production build green; full suite 617/618 then 16/16 on rerun; no backend/schema/architecture changes.

## 15. Final delivery summary

- Already existed: single shared `ProductCard` + islands, catalogue/storefront data layer, cart/wishlist APIs + events, badge/variant/stock/rating helpers (21 tests), KES `PriceDisplay`, Cloudinary `ProductImage`, JB theme tokens, route skeletons, per-page discovery.
- Reused unchanged: all of the above data/logic/APIs; `UICard`/`UIBadge`/`UIButton`/`Skeleton`/`Tooltip`/`cn`; pagination, filters, sort, SEO per page; wishlist-page rows; PDP `ProductActions`.
- Improved: card onto shadcn `UICard`/`UIBadge`/`UIButton`; toasts (Title/Description + dedupe); cart/wishlist copy + error mapping; `ProductImage` loading skeleton; `UIButton` additive exporter; search failure → `UIAlert`.
- Newly created: `ProductGrid` (+skeleton/empty/error), `ui/alert.tsx`, `lib/product-feedback.ts` (+9 tests), report gap matrix (§1b).
- Pages updated: `/`, `/shop`, `/search`, `/categories/[slug]`, `/collections/[slug]`, `/products/[slug]` related.
- Verification: typecheck PASS, targeted tests 30/30 PASS, lint 0 errors, build PASS, full suite 617/618 → 16/16 rerun (flaky, unrelated). Browser/E2E: **NOT VERIFIED**.
- Blockers: none. Limitations: no JSX interaction tests (no RTL by design); visual/device/a11y-walkthrough unverified — see manual steps below.

## 16. Manual verification steps

1. `npm run dev --workspace=@veyra/web` (API running); visit `/`, `/shop`, `/search?q=sneakers`, a category, a collection, a PDP + related row.
2. Confirm cards show real image/name/KES price/accurate badge (sale only with compare-at, single badge max) and pinned actions align per row.
3. Quick-add a single-variant in-stock product → "Added to cart" toast once + header count updates; rapid double-click → single request.
4. Multi-variant product → "Choose Options" → PDP; OOS product → disabled "Out of stock" + details still navigable.
5. Wishlist toggle → "Wishlist updated" add/remove; signed-out → "Sign in required".
6. Disconnect network, quick-add → "Unable to complete action" + retry-safe; no success toast; card state restored.
7. Empty filter/search → "No products found" + Browse-all; break API (stop backend) → inline error alert, not empty catalogue.
8. Keyboard: Tab reaches title link → wishlist → action (no traps, visible focus); toasts don't steal focus.
9. Toggle light/dark/system: contrast + badges readable; 320px viewport: 2-col grid, no horizontal scroll, no clipped prices/buttons.
10. `npm run typecheck --workspace=@veyra/web && npm run lint --workspace=@veyra/web && npm run build --workspace=@veyra/web`.
