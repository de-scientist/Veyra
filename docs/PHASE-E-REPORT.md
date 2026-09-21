# Phase E Report — Catalogue CRUD, Public Catalogue APIs & Storefront Data Migration

## 1. Executive Summary

Phase E cut the storefront from static demo data to the live database:
new public discovery APIs (categories, collections, products with
search/filter/sort/facets/pagination, detail by slug, suggestions),
completed admin catalogue CRUD (attribute update/delete, value delete,
category/collection archive with guards, three new admin pages), an
idempotent 13-product merchandising seed, and a full UI cutover that kept
every page, filter, card, and cart flow working against identical shapes.

## 2. Public Catalogue APIs

New `apps/api/src/lib/storefront.ts` + `routes/storefront.ts`
(registered in `app.ts`); old raw `/catalog/products[/:id]` routes removed.

- `GET /catalog/categories` — ACTIVE tree with visible-product counts.
- `GET /catalog/collections` — ACTIVE with counts + cover image.
- `GET /catalog/products` — `q` (name/desc/SKU/category/attr-value,
  token-AND), `category` (self + descendants; unknown → 404), `collection`
  (unknown → 404), `attrs` (any other key, comma/repeat values),
  `maxPrice`, `inStock`, `sort` (featured/price-asc/price-desc/name/newest),
  `page/pageSize` (12 default, 48 max); returns items + facets + price
  buckets + pagination. Only ACTIVE, non-deleted products/variants.
- `GET /catalog/products/:idOrSlug` — ACTIVE-only detail (variants with
  inventory + attributes, ordered images, category, collections, approved
  review aggregates).
- `GET /catalog/suggest` — products/categories/collections (q ≥ 2 chars).
- `GET /admin/products/:id` — full detail for editors (all statuses).
- Pricing = min active-variant override (fallback base price); decimals
  serialize as numbers; availability = onHand − reserved (missing
  inventory → 0).

## 3. Catalogue CRUD Gaps Closed

- `PATCH /admin/attributes/:id` (rename/type; slug immutable),
  `DELETE /admin/attributes/:id` (409 when variant-mapped),
  `DELETE /admin/attributes/values/:valueId` (409 when used),
  `DELETE /admin/categories/:id` (soft archive; 409 on products or live
  children — archived children no longer block parents, a bug the new
  tests caught), `DELETE /admin/collections/:id` (drops memberships,
  soft-archives; repeat → 404).
- New `AuditAction` values via forward-only migration
  `20260921_phase15_catalogue_crud` (applied; client regenerated).
- New admin pages `/admin/categories`, `/admin/collections`,
  `/admin/attributes` (list/create/edit/archive/delete, toasts, confirm
  dialogs, empty/error/loading states) + AdminShell nav entries. Product
  editor now uses the admin detail endpoint.

## 4. Merchandising Seed

`prisma/seed.catalogue.ts` (`npm run db:seed:catalogue`), idempotent
upserts: 3 pillar + 9 child categories, 6 collections (incl. `featured`,
`weekend-edit`), 8 attributes + values, 13 products (stable slugs/URLs)
with variants (unique SKUs), inventory, ordered images (external URLs —
no fake Cloudinary assets), and collection memberships. Verified
re-runnable with stable counts (14 products incl. one pre-existing).

## 5. Storefront Cutover

New server layer `apps/web/lib/storefront.ts` (ISR 60s) adapts API rows to
the existing `catalog.ts` shapes; static arrays and data-dependent sync
helpers removed from `catalog.ts` (types, pillars, registry, URL-state,
pure math kept). Cut over: home, shop, search, category, collection, PDP,
sitemap, footer (async collections), header subcategories (client fetch,
pillar-grouped, degrades to pillars), search suggestions (debounced
API-backed). `ProductCard` uses server-resolved `categoryName`;
`Product.product` gains `categoryName`/`imageAlts`. Deleted the dead
`storefront-data.ts` shim. Side-effect fixes: wishlist UUID validation
now passes with real IDs (static `p-1` IDs were rejected before).

## 6. CRUD Matrix (catalogue)

| Entity | Create | Read | Update | Delete/Archive |
| --- | --- | --- | --- | --- |
| Product | PASS (pre-existing) | PASS (+admin detail) | PASS | PASS (archive) |
| Category | PASS | PASS (public+admin) | PASS | PASS (guarded archive) |
| Collection | PASS | PASS (public+admin) | PASS | PASS (memberships dropped) |
| Attribute | PASS | PASS | PASS (new) | PASS (new, guarded) |
| Attribute value | PASS | PASS (in attribute) | — (delete+recreate) | PASS (new, guarded) |
| Variant | PASS | PASS | PASS | PASS (archive) |
| Product image | PASS (D) | PASS (D) | PASS (D) | PASS (D) |
| Inventory | — | PASS | PASS (restock/adjust) | n/a (movements append-only) |

## 7. RBAC / Security

All new admin routes use `requireOperationsAccess` (guests 401, customers
403 — tested); public routes are unauthenticated reads of ACTIVE-only
data (DRAFT/ARCHIVED invisible, drafts 404); no client-trusted
authorization; zod-bounded query params; no secrets in responses.

## 8. Testing

- New: `storefront.test.ts` (8: tree/counts, discovery, search across
  name/SKU/values, category+children/collection scope, attr/price/stock
  filters, slug/id detail + draft hiding, suggest, collections) and
  `catalogue.test.ts` (6: customer denial, attribute rename/delete +
  in-use 409s, category archive guards, collection archive, admin
  detail). Updated `smoke.test.ts` to the discovery envelope.
- Full `npm test`: 23 files / 188 tests — 187 pass; the single failure is
  the known pre-existing bcrypt timeout flake (`auth.test.ts`, ~4.6s
  isolated, passes alone, fails only under full-suite parallel load;
  untouched by Phase E). One storefront suite initially failed to
  *collect* on a `featured`-slug collision between seed and fixtures —
  fixed by reusing the seeded collection; suite now 8/8.
- `typecheck` (api+web) pass; `lint` pass (4 pre-existing `<img>`
  warnings); `next build` pass (57 routes, +3 admin pages).

## 9. Known Limitations

- Ratings are computed (approved reviews) but no UI surface displays them
  yet — future PDP enhancement.
- Attribute values support delete+recreate only (no rename endpoint).
- Category/collection archive is one-way in the UI (restore via API/DB).
- `Gender` attribute not seeded (unused by current range).
- Browser click-through QA across viewports/themes not executable here —
  recommend pre-release pass; API-down behavior on discovery pages relies
  on Next error handling (same as all API-dependent pages).
- The stray pre-existing `Shoe` product (no variants) renders
  price-less/out-of-stock in discovery — merchandising cleanup, not code.

## 10. Verification Status

Commands executed: `npm run db:seed:catalogue` (×2, stable counts),
`typecheck` (api+web pass), `lint` (both pass, 4 pre-existing `<img>`
warnings), `next build` (57 routes), targeted suites (storefront 8/8,
catalogue 6/6, product-media 14/14), full `npm test` (23 files / 188
tests → 187 pass, 1 pre-existing bcrypt flake).

```text
PHASE E STATUS: COMPLETE
```
