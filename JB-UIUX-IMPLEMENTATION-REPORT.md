# JB Mercantile — UI/UX Implementation Report

## Executive Summary

The storefront was transformed from a clothing-focused JB shop into **JB Mercantile — Fashion • Footwear • Kitchen & Home**: a data-driven, multi-category retail experience with a complete Light/Dark/System theme system. Catalogue grew 6 → 13 demo products across 3 departments; discovery is URL-driven with category-aware filters; product UX is schema-driven via an attribute registry; all 52 routes build; typecheck/lint/tests green (101/101). **Zero backend changes.**

## Repository Audit

Monorepo (`@veyra/*` workspaces — internal IDs kept): Next.js 14 App Router web (hand-written `globals.css`, no Tailwind, no component library), Fastify/Prisma/Zod API, shared packages. Backend catalogue DB ships **empty** (seed: one `apparel` category, zero products); only `GET /catalog/products[/:id]` is public — so the storefront renders the established static demo catalogue by design. No login pages existed pre-phase-1 (now `/login`, `/register` on live `POST /auth/*`). Prior gaps fixed along the way: 8 duplicated hard-coded status badges, unstyled account/analytics classes, search rendering raw names.

## Existing UI Architecture

Server components for catalogue/discovery; client islands for cart/checkout/wishlist/account/admin/product actions; typed fetch clients (`shopping-api`, `admin-api`, `analytics-api`) with `credentials:include`; single-stylesheet BEM-ish CSS with `--jb-*` tokens (light-only at baseline).

## JB Mercantile Brand Transformation

Customer-facing identity is now JB Mercantile everywhere: SVG `JBLogo`/`JBMark` lettermark (header, footer, auth, admin; PNGs remain for favicon/social), descriptor in layout/ SEO/footer, all page titles `| JB Mercantile`, OG/Twitter/JSON-LD (Organization + WebSite + SearchAction), expanded catalogue sitemap, `| JB` and clothing-only metadata purged (grep-verified; only `@veyra/*` package IDs and `veyra_session` cookies remain — internal, intentionally kept). Royal Blue `#1D4ED8` (action) + `#0047AB` (text accent) + White.

## Information Architecture

Home → Shop (all + `?department=`) → Departments (Fashion/Footwear/Kitchen & Home) → Categories (nested via `parentSlug`) → Collections → Search → Product → Cart → Checkout → Confirmation → Account; Admin journey Manage → Operate → Monitor. All nav/footer/pills/suggestions/sitemap render from `lib/catalog.ts` — extensible to Beauty/Electronics without redesign.

## Navigation Architecture

Desktop: logo, Shop mega-menu (3 departments → categories, Escape/outside-close), department links, search/sign-in/notifications/wishlist/cart with live count badges, theme dropdown (`menuitemradio`). Mobile drawer: hamburger, native `<details>` department expanders, collections/search/account/cart, inline appearance control.

## Homepage Architecture

Mercantile hero (brand + descriptor + Shop now / Explore categories + 3-department imagery), Shop-by-department cards, dynamic Featured, department picks (Fashion/Footwear/Kitchen — hidden if <2 items), Collections (incl. new Kitchen Starter, Step Forward), createdAt-ordered New Arrivals, 4-up trust strip (no invented guarantees).

## Category Architecture

`departments` + hierarchical `categories` (parentSlug) with images/descriptions; department views with subcategory pills; child categories roll up into parents; SEO metadata per category; graceful empties.

## Product Discovery Architecture

`DiscoveryQuery` ↔ URL (`department/category/q/sort/attrs/inStock/maxPrice/page`) — shareable, back-button-safe. Server parses → scopes → facets → filters → sorts → paginates (12/page). Sidebar `FilterPanel` (sticky desktop) + bottom `Sheet` (mobile) share one component with duplicate-ID-safe `idPrefix`. `SortControl` (featured/newest/price/name), active removable chips, suggestions combobox (↑↓/Enter/Escape/clear).

## Attribute Architecture

`ATTRIBUTE_REGISTRY`: Color→swatch, Size/Shoe Size/Capacity/Power→buttons, Material/Style/Brand→checkboxes; unknown attributes degrade to checkboxes. Shoe Size is a distinct kind from apparel Size. PDP groups variant attributes by registry control; selection resolves the exact variant (SKU/price/availability update; invalid combos unselectable).

## Filter Architecture

Facets derive per scope from attributes actually present (≥2 values; Brand suppressed when single) — footwear searches never show Capacity/Power, appliance searches never show Shoe Size. Data-driven price buckets from scoped range + in-stock toggle.

## Product Image Strategy

Unsplash remote pattern (existing); `ProductImage` adds lazy-load + onError branded fallback (never broken); cards add hover image + `-x%` badges + dept/category + stock/option count; PDP gallery has selectable thumbnails + fallback. New footwear/kitchen imagery uses best-known IDs behind the fallback guarantee.

## Theme System

`data-theme` on `<html>`; blocking pre-paint script (`localStorage jb-mercantile-theme` → system fallback); `ThemeProvider` (OS-change sync in System mode only); `ThemeToggle` dropdown in header/mobile/account-preferences (new Appearance radios). Persisted across sessions; `suppressHydrationWarning` + script = no flash/mismatch.

## Light Theme

White canvas/surfaces, ink `#0F1E3D`, royal `#1D4ED8` actions, tinted wells, subtle shadows.

## Dark Theme

Hand-designed (not inverted): `#0B1222` canvas, `#121B31`/`#1A2542` surfaces, `#EAF0FF` ink, action blue lightened to `#3F6FE0` (white-text AA), strong accents `#9DBCFF`, deeper hero gradient, dark semantic tints, `color-scheme: dark`.

## Responsive Strategy

1020px (filters→drawer, mega-menu off), 900px (2-col grids, hamburger), 640px (single column). Sticky summaries/parking disabled on mobile; 44px targets; sheet drawers; scroll-contained tables.

## Accessibility

Skip link, focus-visible rings, semantic landmarks, `ol` breadcrumbs + `aria-current`, labelled controls, live regions (counts, toasts, status), combobox keyboard, radio-group appearance, no color-only state, reduced-motion reset, toggle-switch focus, duplicate-ID-free filters. Full keyboard/screen-reader device pass still recommended (manual QA).

## SEO

Mercantile titles/template/descriptions, canonical, OG/Twitter with product images, favicons, robots (unchanged policy), full catalogue sitemap, BreadcrumbList + Product/AggregateOffer JSON-LD on PDP, category metadata. No fake content (no ratings/warranties/testimonials).

## Performance

No new JS deps (shared JS still 87.1 kB); server-rendered discovery; lazy images with dimensions (no CLS); CSS-only theme; system font stack.

## Component Architecture

New: `catalog.ts`, `JBLogo`, `ThemeProvider` (+toggle/script), `Toast` (provider + `useToast`), `ProductImage`, `AttributeControls` (Swatch/OptionButton/FacetCheckbox/FacetControl), `DiscoveryFilters` (FilterPanel/FilterSheetHost/SortControl), `SearchBar`, `ProductGallery`, `ProductSpecifications`. Refactored: Header/Footer/layout/ProductCard/ProductActions/WishlistButton (toasts)/shop/category/search/collection/product pages/preferences (Appearance)/sitemap/badges (7 local + admin consolidated to `StatusBadge`). `storefront-data.ts` kept as a compatibility shim.

## Files Changed

~30 web files (see git log) + `JB-DESIGN-SYSTEM.md` (v2), new `JB-DESIGN-DECISIONS.md`, this report. No API/schema/migration/config changes.

## Backend/API Compatibility

No contract touched. Auth/cart/wishlist/checkout/orders/payments/delivery/returns/admin all reuse existing endpoints and RBAC. Catalogue cutover points documented in `catalog.ts` for future merchandising.

## Tests Performed

- `npm run typecheck --workspace @veyra/web` — **PASS**
- `npm run typecheck --workspace @veyra/api` — **PASS** (untouched, verified)
- `npm run lint --workspace @veyra/web` — **PASS** (4 pre-existing `<img>` warnings in untouched files)
- `npm test` — **PASS (13 files / 101 tests)**; 401/403/404/429 logs are expected negative-path assertions
- `npm run build --workspace @veyra/web` — **PASS (52/52 routes)** after clearing a stale `.next` cache that caused a one-off `/_document` error; shared JS unchanged

## Issues Found

Fixed: typed-route href casts; `FixedParams` department typing; unused var; "C ourier" copy typos; 3-col grid inline style beating media queries (moved to CSS); unstyled account/analytics classes; duplicated badges; search raw-name bug (prior); missing `idPrefix` duplicates.

## Remaining Issues

- REQUIRES MANUAL REVIEW: real-device (mobile/tablet/desktop) + screen-reader pass; both themes per page; M-Pesa sandbox E2E; new Unsplash IDs visual check (fallback covers failures); production domain swap.
- NOT VERIFIED: live checkout/payment (no creds here); OS-theme-change live behavior (code-reviewed).
- BLOCKED: none. No fake data introduced; no regressions (all suites green).

## Recommendations

Onboard real products/photography/taxonomy; replace `ATTRIBUTE_REGISTRY` with `/admin/attributes`; confirm delivery-zone coverage claims; decide reviews backend (UX omits ratings by design until then); password-reset flow remains out of scope.
