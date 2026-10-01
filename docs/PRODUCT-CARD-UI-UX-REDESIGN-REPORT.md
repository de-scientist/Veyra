# Product Card UI/UX Redesign Report — JB Mercantile

Status: IMPLEMENTED · Verified: typecheck + lint + 427 tests + production build pass.
Date: 2026-10-01. Scope: product card + directly contained interactions only
(`components/ProductCard*`, `WishlistButton`, `ProductRating`,
`lib/product-card*`, adapter plumbing, card CSS). No cart, wishlist,
auth, RBAC, pricing, or catalogue-model changes.

## 1. Existing product-card architecture

- Exactly ONE shared card: `components/ProductCard.tsx`, consumed by home
  (`app/page.tsx` ×5 incl. `eager` for LCP), shop, search, categories,
  collections, and PDP related-products. No duplicate implementations —
  consolidation was already the reality. Wishlist page uses its own
  `wishlist-item` rows (different context, untouched).
- Data: `lib/catalog.ts` shapes (`Product → ProductVariant → SKU →
  inStock`) fed by `lib/storefront.ts` (`toProduct` adapter over public
  `/catalog/*` API, ISR 60 s). Price via `PriceDisplay` (KES, `Intl`
  `en-KE`), images via `ProductImage` (Cloudinary presets
  `thumbnail`/`detail`, legacy passthrough, branded fallback),
  wishlist via `WishlistButton` (`lib/shopping-api.ts`), cart via
  `addToCart(variantId)` + `jb:cart-updated` + toast (PDP `ProductActions`).
  Attributes via `ATTRIBUTE_REGISTRY` (Color→swatch, sizes/capacity/power→
  options) with `colorHex`/`Swatch`/`OptionButton` primitives.

## 2. Problems identified

1. API returned `rating { average, count }` but `toProduct()` silently
   dropped it — cards could never show real ratings.
2. `availableQuantity` likewise dropped — no low-stock signal possible.
3. Card had no purchase action (browse-only); PDP owned all cart logic.
4. `WishlistButton` was a text pill (`Save`/`Saved ✓`) with generic
   `aria-label`s (`Add to wishlist`, no product name) and fired one full
   `GET /wishlist` PER CARD (20 cards → 20 requests).
5. Single `-X%` badge only; `newArrival` flag never surfaced; OOS badge none.
6. Unbounded `shortDescription` + unclamped title → ragged grid heights.
7. No rating row, no variant/color signal, no `compact` need found.

## 3. New design system

- Single `ProductCard` (server component; interactivity isolated in
  client islands `ProductCardActions`, `WishlistButton`). No `compact` /
  `featured` variants — audit found no legitimate density difference.
- Hierarchy: image → badge → wishlist → dept/category → name (2-line
  clamp + tooltip) → rating → color dots → price → stock → action
  (bottom-pinned via `margin-top: auto`, `height: 100%` cards).
- All commerce state from existing architecture; new pure helpers live
  in `lib/product-card.ts` (`cardBadge`, `quickAddVariant`,
  `lowStockQuantity`, `cardColors`, `ratingSummary`,
  `ratingAccessibleLabel`, `starFillPercent`).

## 4. Card structure

`article[aria-labelledby]` → media (image link `tabIndex=-1` + badge +
wishlist overlay, all siblings — never nested interactives) → body
(meta, `h3` title link, rating, colors, price, stock, action). Title link
is the single keyboard stop for navigation; `useId()` keeps
`aria-labelledby` unique when a product appears twice on a page.

## 5. Image behavior

- Unchanged architecture: 4:5 container, `object-fit: cover`, Cloudinary
  `thumbnail` preset, lazy + `eager` for above-fold, secondary-image hover
  + subtle zoom (existing, reduced-motion safe). Branded fallback kept;
  real product name now passed as alt (fixes empty `— image unavailable`).

## 6. Wishlist behavior

- Heart `JBIcon` (filled via CSS when active — no emoji), product-specific
  labels (`Add/Remove {name} …`), `aria-pressed`, busy guard, server
  write-through (no unsafe optimism), toast success/error (guest error
  surfaces backend message). In-flight `GET` deduped module-wide
  (grid → 1 request, results never cached). Text label visible inline
  (PDP), icon-only on card overlay via CSS.

## 7. Cart behavior

- `ProductCardActions`: single-variant in-stock → `Add to Cart`
  (`busy`/`Adding…`/`Added` + check icon, 2 s revert, toast +
  `notifyCartUpdated` — header count syncs, no reload); multi-variant →
  `Choose Options` link (never adds incomplete variants); OOS → disabled
  `Out of stock` (wishlist + PDP stay live). Reuses `addToCart` API only.

## 8. Pricing behavior

- `PriceDisplay` reused untouched (KES `Intl`, struck compare-at).
  Discount badges/badges derive from `discountPercent()` (authoritative
  `compareAtPrice` math — never fabricated). Single-badge priority:
  out > sale > new (`newArrival` is a backend flag).

## 9. Variant handling

- `quickAddVariant()`: exactly-one in-stock variant or nothing.
  Color dots (≤4 + `+N`) from real `Color` values via `colorHex`
  (decorative + `Available in …` sr text); no forced swatches; selection
  stays on PDP (`ProductActions` unchanged). `Size`/`Shoe Size`/`Capacity`/
  `Power` untouched via `attributeDef` registry — future attributes work.

## 10. Responsive behavior

- Existing `.product-grid` columns kept; cards `height: 100%` + pinned
  actions align rows. 44 px wishlist/action targets everywhere; overlay
  label hidden on cards. Code-audited; device testing NOT performed.

## 11. Accessibility changes

- Named wishlist/cart actions per product, `role="img"` rating label
  (`Rated 4.8 out of 5 from 24 reviews…`, stars supplemental),
  valid non-nested semantics, inherited `:focus-visible` rings (+ media
  link ring), unique labelling ids, full names in tooltips.

## 12. Theme changes

- Token-only CSS (`--jb-*`): star track `--jb-border-strong`, fill
  `--jb-primary`, low-stock `--jb-warning`, `badge--muted` surfaces.
  Dark mode via tokens; no color-only communication.

## 13. Performance considerations

- Wishlist N+1 collapsed to one shared in-flight request; no per-card
  subscriptions; images unchanged (preset-bounded, lazy); helpers O(n)
  over variants; no memoization added (grids render server-side).

## 14. Components modified

- `components/ProductCard.tsx` (restructure), `ProductCardActions.tsx`
  + `ProductRating.tsx` (new), `WishlistButton.tsx` (rewrite),
  `ProductActions.tsx` (1-line prop), `lib/catalog.ts` (+`rating`,
  +`availableQuantity`, additive), `lib/storefront.ts` (map both),
  `lib/product-card.ts` + `.test.ts` (new, 16 tests),
  `app/globals.css` (card block). No API/DB/auth/RBAC/route changes.

## 15. Tests performed

- `typecheck` web — pass. `lint` web — 0 errors (4 pre-existing `<img>`
  warnings elsewhere). Full `npm test` — 54 files / 427 pass (16 new).
- `next build` web — pass (all `/products/*`, shop/search/category/
  collection routes). `git grep` markers — none; `git diff --check` —
  clean. No browser, screen-reader, or device testing (not available).

## 16. Known limitations

1. `Settings`-era icon gap N/A — cards reuse `heart`/`cart`/`check`
   `JBIcon`s; star glyphs are inline SVG (stroke set is outline-only).
2. `Only X left` threshold (≤5) is presentational over authoritative
   quantities — documented in `LOW_STOCK_THRESHOLD`; backend exposes no
   explicit low-stock flag.
3. Products without reviews show no rating row (cleaner than `0 reviews`).
4. No card-level skeleton — route-level `DiscoverySkeleton` covers grids.
5. Ratings surfaced only where `/catalog/*` provides them; PDP still shows
   no rating section (follow-up, out of scope).
