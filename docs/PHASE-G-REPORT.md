# Phase G Report — Complete Storefront UI/UX & Production Shopping Experience

## 1. Executive Summary

Phase G hardens the customer storefront into a production-quality shopping
experience **without rewriting it**: the Phase E database-backed catalogue,
Phase B/F session-aware identity, and Phase C/D Cloudinary media work were
audited and found solid, so this phase closes the eight ranked gaps found in
the audit instead of redesigning working pages. Collections reach full parity
with shop/category (facets, price, stock, sort, pagination, active chips);
product imagery renders through optimized Cloudinary delivery presets;
route-level loading skeletons and a storefront error boundary remove blank
screens and raw Next error pages; homepage/SEO gains metadata, canonicals,
ItemList JSON-LD and search noindex; the sitemap drops crawler-ignored query
URLs; the gallery gains arrow-key navigation. Zero fake data, zero new
architectures, zero backend changes.

**Status: PASS** (API typecheck/build blocked by the same pre-existing,
out-of-scope `reservations.ts` error documented in Phase F; untouched by
Phase G — every Phase G surface verifies green.)

## 2. Initial Storefront Audit

Full subagent audit of `apps/web` (routes, data layer, components, layout,
static-data grep, image handling) plus verification of the Phase E/F reports
against live source. Findings:

- Routes: `/`, `/shop`, `/search`, `/products/[slug]`, `/categories/[slug]`,
  `/collections/[slug]`, cart/checkout/wishlist/auth, account (9 sections),
  admin (~25 pages). No `loading.tsx`/`error.tsx` anywhere.
- Data: 100% live via `lib/storefront.ts` (ISR 60s) / `storefront-client.ts`;
  `catalog.ts` holds only department pillars, attribute registry, swatch
  hexes, URL-state helpers, pure math. Zero `mockProducts/demoProducts/
  sampleProducts/fakeProducts` hits; zero hard-coded product arrays.
- Shop/search/category: full discovery (facets, price buckets, in-stock,
  5 whitelisted sorts, URL state, Prev/Next pagination, empty states).
- PDP: strongest SEO on site (Product + BreadcrumbList JSON-LD, OG image,
  related rail, variant actions, specs). No fake ratings/reviews.
- Global shell (Header/search/nav/account/cart/wishlist/theme/footer) already
  meets §§8–10/43–44: session-aware avatar menu, mobile drawer with
  trap/Escape/restore, debounced suggestions combobox, live collections in
  footer. **No header/footer rewrite performed — verified, not rebuilt.**
- Ranked gaps closed: (1) no loading skeletons, (2) no error boundary,
  (3) second-class collections, (4) thin homepage SEO, (5) unoptimized
  product imagery, (6) silent homepage failures (accepted: conditional
  sections, no fake fillers), (7) Prev/Next-only pagination (kept:
  backend contract), (8) query-string sitemap URLs.

## 3. Design Direction

Unchanged from the approved JB Mercantile identity: Royal Blue + White,
neutral light/dark surfaces, restrained semantic colors, existing typography/
spacing/radius/shadow/border tokens in `globals.css`. No new colors, no
gradients, no new component language — Phase G refines within the system
(skeletons reuse `.skeleton` theme tokens). Nothing copied from any external
marketplace; layouts and copy are the project's own.

## 4. Design System Changes

Reuse-only. Verified present and sufficient: type scale, spacing, radius,
elevation, borders, interactive states (default/hover/active/focus-visible/
disabled/loading/error), `.skeleton`/`.skeleton--card` shimmer (light/dark
aware, `prefers-reduced-motion` covered by the global rule), `.empty-state`,
`.product-grid`, `.product-layout`, `.toolbar`, `.pagination`,
`.active-chips`, `.sheet` filter bottom-sheet. **No new tokens, no new CSS.**

## 5. Header / Navigation

Audited, not rewritten (§§8–10 satisfied by existing implementation):

- Desktop hierarchy: brand → Shop mega-menu + department links + Search →
  session-aware account control + notifications/wishlist/cart counts +
  ThemeToggle. No collisions (avatar-only trigger ≤640px).
- Mobile: disclosure nav (Escape + focus restore), auth-aware links,
  appearance section; filter/search use dedicated routes and sheets.
- `SearchBar`: labelled combobox, 250ms debounce, arrow/Enter/Escape,
  outside-click, clear button, GET-form progressive enhancement.
- `Footer`: async server, live top-4 collections + static departments,
  Shop/Collections/Support landmarks. No invented contact, policy, or
  social data.

## 6. Homepage

Kept hierarchy (hero → departments → featured → department rails →
collections → new arrivals → trust strip → footer); all rails conditional on
real data (no fake fillers). Changes:

- `generateMetadata`: title, description, canonical.
- `ItemList` JSON-LD from real featured products; omitted entirely when the
  catalogue returns nothing.
- Hero/department Unsplash brand imagery retained (legitimate project
  assets; catalogue has no banner-image concept — no random replacements).
- Trust strip claims are factual platform properties (backend-calculated
  totals, M-Pesa support, zoned delivery, account returns) — no superlatives.

## 7. Shop

Already a serious catalogue experience; unchanged except shared
improvements (skeletons §24, error boundary §26, thumbnail preset §17,
canonical §49). Breadcrumb, dept-aware title/description, subcategory
pill-nav, result count `role=status`, FilterPanel + mobile sheet, 5
backend-supported sorts, active removable chips, empty state, Prev/Next
pagination preserving all params. No API failure masking: errors now hit
the boundary with retry (previously raw Next error page).

## 8. Search

Unchanged behavior + shared improvements. Three-way states preserved
(no-query starter / `role=alert` error / zero-match with hints); `SearchBar
initialQuery` + autofocus; query + filters + sort + page in URL (refresh/
back/forward/deep-link safe). **Indexing fix**: `robots: { index: false,
follow: true }` so unbounded `?q=` URLs stay out of the index while link
equity still flows to products.

## 9. Filters

Dynamic attribute facets from live API scope (Size/Color/Material/Shoe
Size/Capacity/Power/Brand via registry control mapping + generic fallback —
never Fashion-only). Desktop sidebar + mobile bottom sheet (trap/Escape/
scroll-lock/focus-restore via `useModalFocus`), selected state, clear-all
with count, price radio buckets with clear, in-stock toggle, active chips
with per-filter remove links, page reset on every change. `FixedParams`
extended with `collection` (clear-all preserves it).

## 10. Product Detail

Existing PDP preserved (two-column desktop, stacking mobile, real fields
only: name, description, min-price range, stock badge, variant-aware
`ProductActions`, specs, related rail, breadcrumbs, Product+BreadcrumbList
JSON-LD). Changes: gallery main image uses the `detail` preset; gallery
viewer is a labelled `region` with ArrowLeft/ArrowRight keyboard stepping
(thumbs keep `aria-pressed` + labels); PDP canonical added. No ratings/
reviews fabricated (none rendered); no sticky mobile bar added (not needed).

## 11. Category Pages

Unchanged except shared improvements + canonical. DB-driven header/
description/children pill-nav/discovery/filters/sort/pagination/empty
states; `notFound()` for unknown slugs; DRAFT/ARCHIVED invisible via API.

## 12. Collection Pages

**Biggest functional change — full parity with shop/category.** Rewritten
from sort-only/uncapped-48 to the complete discovery contract:

- `DiscoveryQuery.collection` added (`catalog.ts` parse/serialize +
  `storefront.ts` API param mapping; backend already supported `collection`
  alongside attrs/maxPrice/inStock/sort/page — no backend change).
- FilterPanel + FilterSheetHost, active chips (attr/stock/price with
  remove links), real result count, 5 whitelisted sorts, backend pagination
  with param-preserving Prev/Next, curated empty state.
- Collection slug stays path-driven; redundant `?collection=` is stripped
  from chip/page URLs (mirrors the category pattern).
- Canonical per collection; loading skeleton; `notFound()` preserved.

## 13. Responsive Design

No new breakpoints; existing 900px/640px grid rules + drawer/sheet
patterns reused. Skeletons mirror final layout at every width; tables and
toolbars wrap via existing classes. Long names truncate; no new overflow
vectors introduced (single-line inline styles only mirror existing hero
padding). Live device QA at 320–1920 was not executable here — static
review + recommended pre-release pass (§23).

## 14. Accessibility

- Skeletons: `aria-busy` + visually-hidden `role=status` loader, decorative
  blocks `aria-hidden` (no SR noise).
- Error boundary: `role=alert` with retry button + shop link.
- Gallery: labelled region, optional tab stop (multi-image only), arrow-key
  stepping, labelled thumbs with `aria-pressed`.
- Preserved: drawer/sheet traps, combobox keyboard contract, menu
  arrows/Escape, labelled sort/select/filter controls, meaningful product
  alt text (`product.name`, never `image1`), branded placeholders with
  `role=img` labels, toast live announcements, visible focus tokens,
  reduced-motion support. No emoji icons; no `window.alert/confirm`
  (grep-verified); headings hierarchy untouched.

## 15. SEO

- PDP: unique title/description/OG/Twitter + canonical + Product
  (Offer/Brand, no fake ratings) + BreadcrumbList JSON-LD. Unchanged.
- Homepage: new metadata + canonical + ItemList JSON-LD (real items only).
- Category/collection: metadata + canonical (new).
- Shop: dept-aware metadata + canonical (new).
- Search: metadata + noindex/follow (new).
- Sitemap: dropped crawler-ignored `/shop?department=` URLs; emits static
  + live category/collection/product routes. Robots: catalogue allowed;
  account/checkout/cart/wishlist/order-confirmation/admin/api disallowed.

## 16. GEO / Kenya Considerations

KES pricing, Kenya-framed copy, and the pre-existing hero locale line
preserved as-is; no counties, zones, times, addresses, or branches invented.
Delivery/payment trust copy states only implemented capabilities
(backend totals, M-Pesa support, zoned options at checkout, account
returns). No physical claims added.

## 17. Performance

- Product cards render `c_limit,w_400` instead of full-resolution bytes;
  gallery main renders `c_limit,w_1200`; avatars already on the `w_128`
  square preset. Legacy/external URLs pass through untouched.
- Above-the-fold discipline preserved (homepage `eager` first two featured
  cards, hero `priority`, PDP gallery `eager`; everything else lazy).
- No new client components except the error boundary (required by Next);
  skeletons are server-rendered markup; gallery keyboard adds one handler.
- Data: ISR 60s catalogue caching retained; user-specific fetches stay
  uncached (`credentials: omit` client mirror, session provider).
- No Lighthouse scores claimed (no harness in this environment).

## 18. Data Architecture

Single source of truth re-verified and preserved:

```text
Products/Categories/Collections/Variants/Inventory → PostgreSQL → /api/v1/catalog/* → lib/storefront.ts → Server Components
Identity → veyra_session cookie → /auth/me → SessionProvider
Product media → Cloudinary + ProductImage metadata (canonical secureUrl never rewritten; presets derived at render)
```

No second catalogue, auth, cart, wishlist, or Cloudinary system. Static
`catalog.ts` remains pillars/registry/helpers only. No migration, no seed
change, no backend file touched in Phase G.

## 19. Authentication Integration

Phase B/F identity reused untouched: loading skeleton → Sign in →
avatar/initials trigger + account menu (now incl. Addresses) +
permission-gated Admin entry; mobile auth block; `notifySessionUpdated`
sync on profile/avatar changes; cart/wishlist badges from live APIs.
Regression-covered by the full suite (auth/RBAC/security/account/avatar
tests all green).

## 20. Testing

- New `apps/web/lib/discovery.test.ts` (4): collection parse without
  facet leakage, serialize round-trip, omission when unset (shop/category
  URLs byte-identical), page-1 omission.
- Pre-existing suites all green (no regressions): avatar, account, cart,
  wishlist, catalogue, storefront, product-media, RBAC, security, smoke.
- Full `npm test`: **25 files / 199 tests — all pass.**
- Browser/AT/device QA: NOT RUN (no harness) — code-reviewed against
  existing primitives; pre-release manual pass recommended (§23).

## 21. Commands Executed

| Command | Result | Note |
| --- | --- | --- |
| `npm run typecheck --workspace @veyra/web` | PASS | clean, incl. all new/edited files |
| `npm run typecheck --workspace @veyra/api` | FAIL (pre-existing) | `reservations.ts(50)` `$transaction` error at `origin/main`; zero API files touched in Phase G |
| `npm run lint --workspace @veyra/web` | PASS | 0 errors; 4 pre-existing `<img>` warnings in untouched files |
| `npm test` | PASS | 25 files / 199 tests, all green |
| `npm run build --workspace @veyra/web` | PASS | all routes incl. 5 new loading states + error boundary |
| `npm run build --workspace @veyra/api` | FAIL (pre-existing) | same `reservations.ts` error; out of scope |
| E2E / Lighthouse / SR walk-through | NOT RUN | no tooling in this environment; not claimed |

## 22. Files Changed

- `apps/web/lib/catalog.ts` — `DiscoveryQuery.collection` + parse/serialize.
- `apps/web/lib/storefront.ts` — `collection` API param mapping.
- `apps/web/components/DiscoveryFilters.tsx` — `FixedParams.collection`.
- `apps/web/app/collections/[slug]/page.tsx` — full discovery rewrite +
  canonical.
- `apps/web/components/ProductImage.tsx` — `preset` prop + delivery
  derivation.
- `apps/web/components/ProductGallery.tsx` — detail preset + arrow-key
  viewer region.
- `apps/web/components/DiscoverySkeleton.tsx` (new) + `loading.tsx`
  (shop/search/categories/[slug]/collections/[slug]/products/[slug]) +
  `app/error.tsx` (new boundary).
- `apps/web/app/page.tsx` — metadata + ItemList JSON-LD.
- `apps/web/app/shop/page.tsx`, `search/page.tsx`,
  `categories/[slug]/page.tsx`, `products/[slug]/page.tsx` — canonicals /
  search noindex.
- `apps/web/app/sitemap.ts` — drop query-string department URLs.
- `apps/web/lib/discovery.test.ts` (new, 4 tests).
- `docs/PHASE-G-REPORT.md` — this report.

## 23. Known Limitations

- Prev/Next pagination kept (backend contract; no numbered pages).
- Homepage hides outages as omitted sections (deliberate: never fake
  fillers; now partially mitigated by the error boundary on drill-down
  routes).
- Related rail is same-category → same-department heuristic (real
  relationships, not ML recommendations).
- Dept hero imagery is static brand photography (no catalogue banner
  concept exists).
- Browser/AT/device QA deferred to pre-release manual pass.
- `getProductsByCollection` helper retained (unused by the page, harmless).

## 24. Remaining Risks

- Pre-existing API `typecheck`/`build` failure (`reservations.ts`) still
  blocks fully-green root commands; unrelated to the storefront but should
  be fixed before release.
- Production `NEXT_PUBLIC_APP_URL` must be set so canonicals/sitemap/JSON-LD
  use the real domain (fallback `https://jb.example.com` is a placeholder;
  same convention as the existing layout/sitemap).
- Live Cloudinary delivery + ISR behavior should be smoke-tested against
  staging with real credentials before launch.

## 25. Final Acceptance Status

```text
Acceptance (§95): storefront — homepage/shop/search/PDP/categories/
collections/footer/header redesigned-or-verified ✓; data — real API,
no demo source, dynamic products/categories/collections/variants/stock ✓;
discovery — search/filter/sort/pagination/URL/empty/error states ✓;
PDP — optimized images, variants, accurate price/availability, real info,
real related ✓; auth — logged-out/in, avatar, initials, menu, RBAC ✓;
responsive — patterns reused, no new overflow (live QA deferred) ✓;
a11y — keyboard/focus/drawers/dialogs/search/filters/controls/alt ✓;
themes — tokens only, light/dark/system intact ✓; SEO — metadata,
canonicals, breadcrumb/product/itemlist data (real only), search noindex,
robots/sitemap ✓; quality — no fake data, no alerts, no emoji icons,
no second sources, no rewrites ✓; verification — web typecheck/lint/
tests(199)/build green, API red only pre-existing, report produced ✓.

PHASE G STATUS: COMPLETE — PASS (with the documented pre-existing,
out-of-scope API typecheck/build failure)
```
