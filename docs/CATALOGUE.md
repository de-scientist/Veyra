# Catalogue

Multi-category catalogue across three departments: **fashion**, **footwear**, **kitchen-home**. Nine categories, five collections. Navigation, mega-menu, footer, pills, suggestions, and sitemap render from data — no JSX hard-codes a department.

## Data Sources (important)

- **Storefront discovery** is database-backed (Phase E): `apps/web/lib/storefront.ts` fetches the public `/catalog/*` API (ISR 60s) and adapts rows to the `lib/catalog.ts` shapes the UI renders. Departments stay static brand pillars; categories, collections, products, facets, and suggestions are live. Merchandising content ships via `npm run db:seed:catalogue` (idempotent upserts: 12 categories, 6 collections, 13 products, variants + inventory + images + memberships).
- **Public API** (`apps/api/src/lib/storefront.ts`, routes in `routes/storefront.ts`): `GET /catalog/categories` (tree + visible counts), `GET /catalog/collections` (counts + cover image), `GET /catalog/products` (search/category/collection/attrs/maxPrice/inStock/sort/pagination + facets + price buckets), `GET /catalog/products/:idOrSlug` (ACTIVE-only), `GET /catalog/suggest`. Admin editors use `GET /admin/products/:id` (all statuses).
- **Admin catalogue** (products, categories, collections, attributes, inventory) runs on live APIs against PostgreSQL, with admin UI pages for each area (Phase E added categories/collections/attributes pages + attribute update/delete, value delete, category/collection archive with in-use guards).

## Categories & Collections

`Category` supports `parentId` nesting (e.g. Sneakers under Footwear). `Collection` groups products across departments (`ProductCollection` join). Admin CRUD exists for both.

## Products & Variants

`Product`: slug, name, descriptions, department, category, brand, status (`DRAFT → ACTIVE → ARCHIVED`), base price + `compareAtPrice`, images, `specs` (free-form facts). `ProductVariant`: SKU (unique), name, price/override, status (`ACTIVE/INACTIVE/ARCHIVED`), attribute map (`VariantAttributeValue`), per-variant stock.

## Flexible Attributes

Attributes are data-driven, not hard-coded. `Attribute` + `AttributeValue` define the vocabulary; the storefront `ATTRIBUTE_REGISTRY` maps each attribute to a control:

| Attribute kinds | Control | Examples |
|---|---|---|
| Color | swatch | apparel, footwear, appliances |
| Size, Shoe Size, Capacity, Power | option buttons | S/M/L vs EU 38–44 vs 1.8L vs 1500W |
| Material, Style, Brand | checkboxes/facets | cotton, runner, Philips-style brands |

`Shoe Size` is distinct from apparel `Size` so ranges never mix. Specs are category-appropriate facts (Fit/Care vs Capacity/Power/Voltage) rendered by one generic component.

## Product Imagery

`ProductImage` (per product, ordered; variant-specific images supported). Storefront uses `next/image` with branded fallback. Demo imagery is Unsplash (`next.config.mjs` remote pattern). Object storage: Cloudinary signed-upload infrastructure landed in Phase C (see [CLOUDINARY.md](CLOUDINARY.md)); `ProductImage` provider-metadata persistence belongs to Phase D.

## Category-Aware Discovery

Shop, category, collection, and search pages share one discovery engine: `DiscoveryQuery` (department/category/q/sort/attrs/in-stock/page) in URL state (shareable, back-button-safe). The API computes the scope (category includes descendants; search spans names/descriptions/SKUs/category/attribute values, token-AND) → facets (only attributes present in scope with ≥2 values; Brand excluded) → price buckets (tertiles, suppressed when range < KES 1,000) → sort (featured = `featured`-collection members first, then newest; price asc/desc; name; newest) → pagination (12/page, max 48). Combobox search with keyboard navigation (debounced, API-backed suggestions).

Derived display rules (documented, not stored): `featured` = member of the `featured` collection; `newArrival` = created within 30 days; `brand` = first `Brand` variant attribute (fallback `JB Mercantile`); product `specs` = first variant's attributes minus Brand; price = minimum active-variant price (fallback base price); availability = `quantityOnHand − quantityReserved`.

## Publishing Rules

Products render publicly only when `ACTIVE` and not soft-deleted; variants likewise. Price snapshots are authoritative at checkout, not at display.
