# JB Mercantile — Commerce UI/UX Upgrade Report

Status: IMPLEMENTED (with documented limitations)
Date: 2026-10-05
Scope: customer-facing storefront only (`apps/web` customer routes + shared
components). No database, auth/RBAC, payment, inventory, or API changes.

## 1. Executive Summary

The JB storefront was already a mature, backend-authoritative commerce UI
(design-system v2, Cloudinary presets, audited cart/wishlist/session flows).
This phase closed the remaining gaps against the reference UX patterns
(Maisha Store simplicity, Ukomax merchandising strength) without rewriting
working business logic:

- New slim utility bar (no invented phone number — see §19).
- Navbar: single search entry (duplicate removed), live wishlist count,
  accessible modal mobile drawer (focus trap, Escape, scroll lock, focus
  restore), Collections link kept to a real seeded collection.
- Product cards: shared `ProductCard` extended with real-data `LOW STOCK`
  badge and generic `variantHint` ("3 colours · 2 sizes") — no hard-coded
  Size/Color assumptions.
- PDP: rating + SKU + discount treatment, highlights from real data,
  stock-aware quantity ceiling, working **Buy Now** (add-to-cart then route
  to existing `/checkout`), honest delivery panel (no invented rates),
  accessible Description/Specifications/Reviews tabs, related products,
  reusable trust strip.
- Cart: skeleton loading, retryable error state, accessible quantity
  steppers, per-line totals, move-to-wishlist, availability warnings,
  provisional-totals disclaimer, confirm-dialog clear-cart, branded empty
  state, loading checkout CTA — no page reloads anywhere.
- Shared primitives: `JBPageLoader` (official JB logo), `JBButtonLoader`,
  card/grid/PDP/cart skeletons, `JBAlert`, `QuantityStepper`,
  reusable `TrustStrip` (homepage + PDP).
- Footer: real-routes-only Shop / Customer service / Account columns plus
  brand block; no dead legal/FAQ/contact links.

Verification: `tsc --noEmit` PASS, `next lint` PASS (only pre-existing
`<img>` warnings), `npm test` 465/466 (one unrelated API bcrypt timeout —
see §18), `next build` PASS. Regression greps clean.

## 2. Reference Site Analysis

Studied strictly as UX/interaction references (no code, assets, text, or
branding copied):

**Maisha Store** (`store.cm.co.ke/shop`, product, cart):
- Simple commerce IA: support access, one search, cart count, category
  nav, account actions, featured products, reassurance strip, structured
  footer, minimal empty-cart with continuation CTA.
- Adopted: utility bar, one intentional search, trust strip, structured
  footer columns, branded empty cart with Start Shopping + Wishlist paths.

**Maisha product page**: gallery → name/category/SKU/rating/price/stock/
quantity/Add to Cart → delivery info → description/specs/reviews →
related. Adopted as the PDP information architecture baseline.

**Ukomax product page**: sale badge, previous/current price + discount %,
multi-image gallery, feature bullets, quantity control, Add to Cart +
Buy Now, SKU/category meta, reviews, contact block. Adopted: discount
treatment (`Save X%`), highlights, Buy Now (implemented safely on the
existing cart→checkout flow), delivery panel. Contact-number block
deliberately NOT adopted — no authoritative JB number exists.

## 3. Current JB UI Audit

Found already-implemented (reused, not rewritten):
`Header` (mega-menu, session, cart count, theme), `Footer` (4-col, live
collections), `ProductCard` + `ProductCardActions` (quick-add, toast,
`jb:cart-updated` sync), `ProductGallery` (keyboard, fallback),
`ProductActions` (schema-driven variants), `CartPageClient`, `WishlistButton`
(burst-safe shared flight), `Toast` (aria-live), `ThemeProvider`
(Light/Dark/System + blocking script), `JBConfirmDialog` + `useModalFocus`
single focus primitive, `JBLogo`/`JBIcon`, Cloudinary presets, KES
`PriceDisplay`, skeletons/empty/error primitives in `jb-ui`.

Gaps found and closed: no utility bar; duplicate search (nav "Search" link
+ search icon); no wishlist count/sync; mobile nav a non-modal disclosure
(no trap/scroll-lock/restore); footer missing service/account depth;
no branded logo loader; no shared alert/stepper/skeleton set; cards lacked
low-stock badge + variant hints; PDP lacked rating/SKU/discount/tabs/
Buy Now/delivery honesty block; cart lacked steppers/line totals/
move-to-wishlist/retry/branded empty state.

## 4. Design-System Changes

- No new dependencies. shadcn/ui is not installed in this repo; instead the
  existing JB token system (`globals.css`, single source) was extended with
  shadcn-patterned primitives (tabs≈`Tabs`, drawer≈`Sheet`,
  alert≈`Alert`, confirm≈`AlertDialog`) using JB tokens, `JBIcon`, and the
  single `useModalFocus` primitive. Rationale: installing Radix + shadcn
  over a complete, theme-aware, AA-checked system would duplicate working
  components for zero behavior gain (scope rule: reuse > rewrite).
- New styles appended to `apps/web/app/globals.css` only (utility bar,
  drawer, loader, alerts, stepper, tabs, delivery panel, card/cart/footer
  additions). All theme-aware via `var(--jb-*)`; `prefers-reduced-motion`
  covered by the existing global rule plus local keyframes.
- `lib/product-card.ts`: `CardBadge` gains `'low'` (priority
  out > sale > low > new); new pure `variantHint()` helper.

## 5. Navbar/Header

`apps/web/components/Header.tsx` (rewritten):
- Utility bar: "We deliver across Kenya · Secure M-Pesa payments" + Shop
  link. Compact, theme-aware (primary bg), collapses on mobile. No phone
  number rendered (authoritative contact UNKNOWN — §19).
- Exactly ONE search interaction (icon link → `/search` combobox page);
  the old duplicate main-nav "Search" text link was removed.
- Live counts: cart (`jb:cart-updated`, as before) + wishlist
  (`jb:wishlist-updated`, new) + notifications (unchanged 60s poll).
- Mobile navigation is now a modal drawer: `role=dialog aria-modal`,
  overlay click closes, `useModalFocus` trap/Escape/scroll-lock/focus
  restore, `<details>` department expanders, wishlist/cart counts,
  appearance control.
- Session behavior unchanged (AccountMenu / skeleton / Sign in).

## 6. Product Cards

- `cardBadge()` now surfaces real low-stock scarcity (`Only X left`
  badge, amber, with text — never color-only).
- New `variantHint()`: generic `"N colours"`, `"N sizes"`,
  `"N capacities"` etc. from live attribute data; null when nothing
  varies. Rendered as `.product-card__hint`.
- Pricing/discounts untouched (authoritative `compareAtPrice` math,
  KES formatting). Images untouched (Cloudinary presets, lazy, fallback).
- Quick-add flow untouched (validates variant, busy guard, toast,
  `notifyCartUpdated`, no reload).

## 7. Product Detail Page

`apps/web/app/products/[slug]/page.tsx` + new `ProductTabs.tsx` +
extended `ProductActions.tsx`:
- Summary: department · category eyebrow, H1, real rating + review-count
  anchor, SKU (single-variant) or variant count + brand meta, From-price
  range, `PriceDisplay` + `Save X%` badge, stock `StatusBadge`.
- Highlights from `shortDescription` (only when distinct from
  description — never fabricated bullets).
- `QuantityStepper` with authoritative ceiling
  (`min(availableQuantity, 20)`; backend still validates on write).
- Add to Cart (existing flow + button loader) and **Buy Now**
  (add-to-cart → `router.push('/checkout')` using the existing checkout
  architecture — no dead button, no new API).
- Delivery & payment panel: zone/method fees at checkout, M-Pesa
  verification note. No rates invented.
- `ProductTabs` (Description / Specifications / Reviews): roving
  `tabindex`, arrow keys, tab/tabpanel linkage. Reviews show the real
  backend rating or an honest "No reviews yet" state (no public review
  endpoint exists; no fake form).
- Related products via existing `ProductCard`; `TrustStrip` reused;
  SEO (metadata, canonical, Product/Breadcrumb JSON-LD) preserved.

## 8. Cart

`CartPageClient.tsx` rewritten + `app/cart/page.tsx` semantic
breadcrumbs:
- `CartSkeleton` while loading; `JBAlert` with retry when load fails.
- Availability/price-change warnings; provisional-totals disclaimer
  ("Checkout recalculates authoritative totals").
- Per-item: image (lazy, fallback), name, variant, SKU + attributes,
  unit price, **line total**, `QuantityStepper` (ceiling from
  `availableQuantity`, per-item busy guard against races), Move to
  wishlist (writes through wishlist API + both sync events), Remove with
  toast.
- Summary: itemized subtotal, "Calculated at checkout" delivery row,
  total, loading checkout CTA (`router.push`, no reload), Clear cart
  behind `JBConfirmDialog` (destructive, loading guard), Continue
  shopping link.
- Branded empty state: JB logo, message, Start shopping + View wishlist.

## 9. Loading States

New `apps/web/components/JBLoading.tsx`: `JBPageLoader` (official
`JBLogo` + pulse, `role=status`), `JBButtonLoader` (progress dots +
label), `ProductCardSkeleton` / `ProductGridSkeleton` /
`ProductDetailSkeleton` / `CartSkeleton` (geometry-matched, polite live
announcements), `JBAlert` (error/warning/info/success + optional retry),
`QuantityStepper` (labelled, min/max, busy guard, keyboard-native).
Reduced-motion: animations collapse under the existing global rule.

## 10. Alerts/Feedback

- Short-lived: existing `Toast` (`aria-live=polite`, 4s) — now used for
  remove-from-cart and move-to-wishlist confirmations too.
- Persistent: `JBAlert` for load failures (with retry), cart update
  failures, and availability warnings.
- Destructive/confirm: existing `JBConfirmDialog` reused for Clear cart.
- No `alert()`/`confirm()` anywhere (verified by grep).

## 11. Footer

`apps/web/components/Footer.tsx` expanded: brand block with descriptor +
positioning line, Shop (All + 3 departments + live collections),
Customer service (Orders & tracking, Returns & exchanges, Search,
Checkout), Account (My account, Profile, Wishlist, Cart). Every link is a
verified existing route. Bottom bar: © line + "Kenya · Secure checkout ·
M-Pesa supported". No invented phone/email/legal/FAQ links.

## 12. Responsive Design

Reuse of the existing breakpoint system (900px nav→drawer via the new
modal drawer on all sizes when toggled; 640px single-column grids).
Touched surfaces use fluid layouts: utility bar collapses, drawer is
`min(340px, 88vw)`, PDP grid → single column, cart → stacked with static
summary, steppers stay 44px targets, footer → stacked. No new fixed
widths; no horizontal overflow introduced (flex-wrap + minmax grids).
Validated by build + CSS review; device/browser pixel validation NOT
performed (no device lab in this environment) — marked NOT VERIFIED below.

## 13. Accessibility

- Semantic landmarks/headings preserved; breadcrumbs are `nav > ol` with
  `aria-current`; drawer is `dialog`/`aria-modal`; tabs follow the
  tablist pattern with arrow-key support; steppers use native labelled
  inputs with min/max + described max.
- Focus: single `useModalFocus` primitive for drawer + dialogs; visible
  `:focus-visible` rings unchanged; skip link unchanged; toasts
  `aria-live`; stock/rating always paired text (never color-only).
- Images keep alt/fallback behavior; `prefers-reduced-motion` respected.
- Automated a11y test run NOT performed (no axe/playwright harness in
  repo) — keyboard/focus semantics verified by code review only.

## 14. Theme Support

All new UI uses `var(--jb-*)` tokens with dark-theme values already
defined (navy surfaces, lighter action blue, tinted alert backgrounds).
Logo renders via `JBLogo` (white-chip handling in dark mode). No
hard-coded white/black surfaces introduced. Verified by token review +
build; visual side-by-side theme QA NOT performed.

## 15. Performance

- No new data fetching: wishlist count reuses the existing endpoint via
  the shared in-flight pattern; drawer/categories unchanged.
- Images: Cloudinary presets + lazy loading retained; skeletons prevent
  layout thrash perception.
- Client components added only where interactivity requires
  (drawer, tabs, steppers, cart); PDP/page shells stay server components.
- No measurements taken (no perf harness); no blind memoization added.

## 16. SEO

Preserved: per-product metadata + canonical, Open Graph/Twitter,
Product + Breadcrumb JSON-LD, ItemList on home, `robots.ts`/`sitemap.ts`
untouched, cart stays `noindex`. PDP headings/breadcrumbs kept
indexable; tab panels use `hidden` (inactive content not indexed as
visible text, active Description content server-rendered).

## 17. Testing

Added/updated (vitest, all passing):
- `apps/web/lib/product-card.test.ts`: low-stock badge priority,
  sale-over-low priority, healthy-new rule, `variantHint` (apparel,
  appliance, silent cases). 21 tests.
- `apps/web/lib/cart-events.test.ts`: `WISHLIST_UPDATED_EVENT` name,
  dispatch, SSR no-op. 6 tests.
Full `npm test`: 465/466 pass; the single failure is
`apps/api/src/lib/auth.test.ts` (bcrypt timeout, unrelated to this
phase — see §18). New coverage targets pure helpers/events only; no
component harness exists in the repo (no Testing Library), so
card/PDP/cart interactions are verified by build + code review, not DOM
tests — recorded as a limitation.

## 18. Runtime Validation

Executed in this environment:
- `npx vitest run product-card cart-events`: 27/27 PASS.
- `npm test`: 465/466 (1 unrelated failure: API `auth.test.ts`
  "hashes and verifies passwords" — 5s bcrypt timeout under load;
  pre-existing/environmental, untouched by this phase).
- `npm run typecheck --workspace=@veyra/web`: PASS.
- `npm run lint --workspace=@veyra/web`: PASS (only pre-existing
  `no-img-element` warnings, including the pre-existing cart/wishlist
  `<img>` pattern).
- `npm run build --workspace=@veyra/web`: PASS (all 60 routes; the
  `ECONNREFUSED` prerender fetch logs are pre-existing graceful
  degradation — every catalogue fetch has `.catch` fallbacks).
- Regression greps: no `window.confirm`/`alert`/`location.reload`,
  no `params.then` misuse, no conflict markers, typed
  `currentTarget.value` handlers only, `sessions.filter` guarded by
  `getSessions` normalization.
- NOT performed: browser/device visual QA (no device lab), screen-reader
  pass, Lighthouse, or live backend-clickthrough (no running API/DB in
  this session). Claims above reflect code/build/test evidence only.

## 19. Known Limitations

1. Authoritative JB phone/email: UNKNOWN — requires business input
   (Business Decision Register). Utility bar and footer show no number
   rather than inventing one.
2. No public review-submission endpoint (admin-only moderation API), so
   the Reviews tab is read-only and honest.
3. No legal/FAQ/shipping-info content pages exist; footer links only to
   real routes.
4. shadcn/ui package not installed by decision (§4); accessible
   equivalents built on JB tokens.
5. No DOM-level component tests (no harness in repo); interaction QA is
   build + review evidence.
6. Responsive/theme/accessibility QA is code-review level, not
   browser-verified.

## 20. Final Status

```
JB MERCANTILE COMMERCE UI/UX UPGRADE STATUS

Navbar/Header: PASS
Product Cards: PASS
Product Detail Page: PASS
Cart: PASS
Loading States: PASS
Alerts/Feedback: PASS
Footer: PASS
Responsive QA: NOT VERIFIED
Accessibility QA: PARTIAL
Theme QA: PARTIAL
Performance: PARTIAL
SEO: PASS
Automated Tests: PARTIAL
Build/Typecheck/Lint: PASS
Documentation: PASS
```

Notes on statuses: Responsive/Theme are NOT VERIFIED/PARTIAL because no
browser/device inspection was possible in this environment — the code
uses the verified token/breakpoint system and builds cleanly. Automated
Tests is PARTIAL (pure-helper coverage added and passing; no DOM harness
exists). Accessibility/Performance are PARTIAL (semantics and budgets
preserved by construction, not measured). No numerical scores claimed.

### Components created/updated · routes · contracts · tests

- Created: `components/TrustStrip.tsx`, `components/JBLoading.tsx`
  (loader, button loader, 4 skeletons, alert, stepper),
  `components/ProductTabs.tsx`, `docs/JB-COMMERCE-UI-UX-UPGRADE-REPORT.md`.
- Updated: `components/Header.tsx`, `components/Footer.tsx`,
  `components/ProductCard.tsx`, `components/ProductCardActions.tsx`
  (untouched), `components/ProductActions.tsx`,
  `components/CartPageClient.tsx`, `components/WishlistButton.tsx`,
  `components/WishlistPageClient.tsx`, `app/products/[slug]/page.tsx`,
  `app/cart/page.tsx`, `app/page.tsx`, `app/globals.css`,
  `lib/shopping-api.ts` (+`WISHLIST_UPDATED_EVENT`), `lib/product-card.ts`
  (+`low` badge, `+variantHint`), `lib/product-card.test.ts`,
  `lib/cart-events.test.ts`.
- Routes changed: `/` (trust strip component), `/cart` (breadcrumbs),
  `/products/[slug]` (PDP). No route added or removed.
- shadcn/ui components used: none as packages (decision in §4);
  patterns implemented: Tabs, Sheet (drawer), Alert, AlertDialog.
- API contracts consumed (unchanged): `GET /cart`, `POST/PATCH/DELETE
  /cart/items`, `GET/POST/DELETE /wishlist/items`, public `/catalog/*`
  via `lib/storefront(-client)`, `POST /checkout/preview` untouched.
- Auth/session/RBAC/Cart/Cloudinary architectures: preserved unchanged.
