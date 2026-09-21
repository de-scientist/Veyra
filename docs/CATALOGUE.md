# Catalogue

Multi-category catalogue across three departments: **fashion**, **footwear**, **kitchen-home**. Nine categories, five collections. Navigation, mega-menu, footer, pills, suggestions, and sitemap render from data — no JSX hard-codes a department.

## Data Sources (important)

- **Storefront discovery** currently runs on static demo data in `apps/web/lib/catalog.ts` (13 products, KES pricing, Unsplash imagery). The backend product database is empty by design and exposes only `GET /catalog/products[/:id]` publicly. `lib/catalog.ts` documents the cutover: replace its arrays with `/catalog/*` + `/admin/*` responses; pages and filters consume identical shapes.
- **Admin catalogue** (products, categories, collections, attributes, inventory) runs on live APIs against PostgreSQL.

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

Shop, category, collection, and search pages share one discovery engine: `DiscoveryQuery` (department/category/q/sort/attrs/in-stock/page) in URL state (shareable, back-button-safe), `scopeProducts` → `deriveFacets` (only attributes present in scope with ≥2 values) → `derivePriceBuckets` (tertiles, suppressed when range < KES 1,000) → `applyDiscovery` → `paginate` (12/page). Sort: featured, newest, price asc/desc, name A–Z. Combobox search with keyboard navigation.

## Publishing Rules

Products render publicly only when `ACTIVE` and not soft-deleted; variants likewise. Price snapshots are authoritative at checkout, not at display.
