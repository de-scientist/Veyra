# Catalogue

Multi-category catalogue across three departments: **fashion**, **footwear**, **kitchen-home**. Nine categories, five collections. Navigation, mega-menu, footer, pills, suggestions, and sitemap render from data — no JSX hard-codes a department.

## Data Sources (important)

- **Storefront discovery** is database-backed (Phase E): `apps/web/lib/storefront.ts` fetches the public `/catalog/*` API (ISR 60s) and adapts rows to the `lib/catalog.ts` shapes the UI renders. Departments stay static brand pillars; categories, collections, products, facets, and suggestions are live. Merchandising content ships via `npm run db:seed:catalogue` (idempotent upserts: 12 categories, 6 collections, 13 products, variants + inventory + images + memberships).
- **Public API** (`apps/api/src/lib/storefront.ts`, routes in `routes/storefront.ts`): `GET /catalog/categories` (tree + visible counts), `GET /catalog/collections` (counts + cover image), `GET /catalog/products` (search/category/collection/attrs/maxPrice/inStock/sort/pagination + facets + price buckets), `GET /catalog/products/:idOrSlug` (ACTIVE-only), `GET /catalog/suggest`. Admin editors use `GET /admin/products/:id` (all statuses).
- **Admin catalogue** (products, categories, collections, attributes, inventory) runs on live APIs against PostgreSQL, with admin UI pages for each area (Phase E added categories/collections/attributes pages + attribute update/delete, value delete, category/collection archive with in-use guards).

## Categories & Collections

`Category` supports `parentId` nesting (e.g. Sneakers under Footwear). `Collection` groups products across departments (`ProductCollection` join). Admin CRUD exists for both.

## Products & Variants

`Product`: slug, name, descriptions, department, category, brand, status (`DRAFT → ACTIVE → ARCHIVED`), base price + `compareAtPrice`, images, `specs` (free-form facts), plus `styleCode` (Phase 1: stable style/model identifier used as the `{STYLE}` SKU segment — the display name is never a SKU segment). `ProductVariant`: SKU (unique), name, price/override, status (`ACTIVE/INACTIVE/ARCHIVED`), attribute map (`VariantAttributeValue`), per-variant stock, plus `barcode` (nullable unique, separate concept from SKU — generation drivers out of scope), `skuTemplateVersion` (frozen at creation) and `skuLockedAt` (set once transactional history exists; SKU edits rejected after lock).

## SKU Architecture (Phase 1 foundation)

SKUs identify unique sellable inventory variants and are server-authoritative. Domain logic lives in `apps/api/src/lib/sku.ts` (pure functions: no Prisma imports — generation is separate from persistence):

- **Canonical form**: `UPPER` alnum segments joined by `-`, max 32 chars for generated SKUs (manual/legacy boundary accepts the pre-existing 3–64 contract, normalized). Example: `NKE-SHO-AM90-BLK-42`.
- **Code dictionaries** (admin-managed, unique per scope): `Category.code` (2–5 chars), `AttributeValue.code` (2–6 chars, unique per attribute — `Blue→BLU` never collides with `Black→BLK`; `Blush` takes an explicit distinct code), `Product.styleCode` (2–10 chars). Missing codes fall back to deterministic derivation (`deriveCode`/`deriveStyleCode` — same inputs always yield the same code; no random suffixes).
- **Category templates**: `Category.skuTemplate` (e.g. clothing/footwear `{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}`, appliances `{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}`, utensils `{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}`) with `skuTemplateVersion`. Template edits never rewrite existing variant SKUs. Combination math (`buildVariantCombinations`, cap 300/request) supports cartesian axes plus explicit allow-lists for restricted combos.
- **Rules**: DB unique constraint on `sku` is the final authority (`P2002` → `409 SKU_ALREADY_EXISTS` / `BARCODE_ALREADY_EXISTS` — never silent `-01` suffixes); variant + zeroed inventory persist in one transaction (all-or-none); editing name/description/category/styleCode never rewrites variant SKUs; `OrderItem.sku` remains the frozen sale-time snapshot. Manual SKUs are normalized + validated (`INVALID_SKU`) and still pass uniqueness. New `AuditAction`s: `VARIANT_CREATED/VARIANT_ARCHIVED/SKU_GENERATED/SKU_OVERRIDDEN/SKU_VALIDATION_FAILED/SKU_DUPLICATE/SKU_REGENERATED/SKU_ARCHIVED`.
- **Seed**: `prisma/seed.catalogue.ts` curates all category codes/templates, attribute value codes and product style codes (idempotent upserts). Migration: `prisma/migrations/20260929_phase17_sku_foundation/` (additive-only; existing SKUs preserved verbatim).

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
