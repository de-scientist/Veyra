# Catalogue

Multi-category catalogue across three departments: **fashion**, **footwear**, **kitchen-home**. Nine categories, five collections. Navigation, mega-menu, footer, pills, suggestions, and sitemap render from data — no JSX hard-codes a department.

## Data Sources (important)

- **Storefront discovery** is database-backed (Phase E): `apps/web/lib/storefront.ts` fetches the public `/catalog/*` API (ISR 60s) and adapts rows to the `lib/catalog.ts` shapes the UI renders. Departments stay static brand pillars; categories, collections, products, facets, and suggestions are live. Merchandising content ships via `npm run db:seed:catalogue` (idempotent upserts: 12 categories, 6 collections, 13 products, variants + inventory + images + memberships).
- **Public API** (`apps/api/src/lib/storefront.ts`, routes in `routes/storefront.ts`): `GET /catalog/categories` (tree + visible counts), `GET /catalog/collections` (counts + cover image), `GET /catalog/products` (search/category/collection/attrs/maxPrice/inStock/sort/pagination + facets + price buckets), `GET /catalog/products/:idOrSlug` (ACTIVE-only), `GET /catalog/suggest`. Admin editors use `GET /admin/products/:id` (all statuses).
- **Admin catalogue** (products, categories, collections, attributes, inventory) runs on live APIs against PostgreSQL, with admin UI pages for each area (Phase E added categories/collections/attributes pages + attribute update/delete, value delete, category/collection archive with in-use guards).

## Categories & Collections

`Category` supports `parentId` nesting (e.g. Sneakers under Footwear). `Collection` groups products across departments (`ProductCollection` join). Admin CRUD exists for both.

## Products & Variants

`Product`: slug, name, descriptions, department, category, brand, status (`DRAFT → ACTIVE → ARCHIVED`), base price + `compareAtPrice`, images, `specs` (free-form facts), plus `styleCode` (Phase 1: stable style/model identifier used as the `{STYLE}` SKU segment — the display name is never a SKU segment). `ProductVariant`: SKU (unique), name, price/override, status (`ACTIVE/INACTIVE/ARCHIVED`), attribute map (`VariantAttributeValue`), per-variant stock, plus `barcode` (nullable unique machine-readable operational key — see Barcode below), `skuTemplateVersion` (frozen at creation) and `skuLockedAt` (set once transactional history exists; SKU edits rejected after lock).

## SKU Architecture (Phase 1 foundation)

SKUs identify unique sellable inventory variants and are server-authoritative. Domain logic lives in `apps/api/src/lib/sku.ts` (pure functions: no Prisma imports — generation is separate from persistence):

- **Canonical form**: `UPPER` alnum segments joined by `-`, max 32 chars for generated SKUs (manual/legacy boundary accepts the pre-existing 3–64 contract, normalized). Example: `NKE-SHO-AM90-BLK-42`.
- **Code dictionaries** (admin-managed, unique per scope): `Category.code` (2–5 chars), `AttributeValue.code` (2–6 chars, unique per attribute — `Blue→BLU` never collides with `Black→BLK`; `Blush` takes an explicit distinct code), `Product.styleCode` (2–10 chars). Missing codes fall back to deterministic derivation (`deriveCode`/`deriveStyleCode` — same inputs always yield the same code; no random suffixes).
- **Category templates**: `Category.skuTemplate` (e.g. clothing/footwear `{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}`, appliances `{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}`, utensils `{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}`) with `skuTemplateVersion`. Template edits never rewrite existing variant SKUs. Combination math (`buildVariantCombinations`, cap 300/request) supports cartesian axes plus explicit allow-lists for restricted combos.
- **Rules**: DB unique constraint on `sku` is the final authority (`P2002` → `409 SKU_ALREADY_EXISTS` / `BARCODE_ALREADY_EXISTS` — never silent `-01` suffixes); variant + zeroed inventory persist in one transaction (all-or-none); editing name/description/category/styleCode never rewrites variant SKUs; `OrderItem.sku` remains the frozen sale-time snapshot. Manual SKUs are normalized + validated (`INVALID_SKU`) and still pass uniqueness. New `AuditAction`s: `VARIANT_CREATED/VARIANT_ARCHIVED/SKU_GENERATED/SKU_OVERRIDDEN/SKU_VALIDATION_FAILED/SKU_DUPLICATE/SKU_REGENERATED/SKU_ARCHIVED`.
- **Seed**: `prisma/seed.catalogue.ts` curates all category codes/templates, attribute value codes and product style codes (idempotent upserts). Migration: `prisma/migrations/20260929_phase17_sku_foundation/` (additive-only; existing SKUs preserved verbatim).

## Variant Generation Engine (Phase 2)

One domain engine turns a product's selected variant attributes into sellable variants (`apps/api/src/lib/variant-generation.ts` pure planner + `variant-generation-service.ts` persistence; endpoint `POST /admin/products/:productId/variants/generate`, operations staff only).

- **Variant-defining dimensions are data-driven**: the non-identity tokens of the category `skuTemplate` (clothing/footwear `{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}`, appliances `{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}`, utensils `{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}`). `BRAND/CATEGORY/STYLE` are identity, never dimensions. Descriptive attributes (no template token) are rejected (`ATTRIBUTE_NOT_VARIANT_DEFINING`), never silently expanded. Slug→token mapping is exact-then-suffix (`shoe-size` → `SIZE`) with no category hardcoding.
- **Pipeline**: `validateAxes` (attribute/value existence, dictionary codes, required dimensions, dedupe) → `planCombinations` (cartesian product via Phase 1 `buildVariantCombinations`, cap 300/operation, optional explicit `allowList` for commercially-valid subsets) → Phase 1 `generateSku` (single source of truth; brand from `brandCode`/`brandValueId`/established product brand, category `code`, product `styleCode` with deterministic fallbacks) → transactional persistence.
- **Identity**: canonical `productId + sorted (attributeId, attributeValueId)` key from `VariantAttributeValue` rows — SKU text is output, never identity. Repeats return `existing` (idempotent); incremental adds create only new combinations.
- **Safety**: single `prisma.$transaction` (variant + mappings + zeroed inventory `{0,0,5}` + `VARIANT_CREATED` audit) — all-or-nothing; foreign SKU collisions abort with `409 SKU_ALREADY_EXISTS` (never silent suffixes); variants are never deleted by the engine (de-selection preserves; archival stays on variant PATCH). New variants inherit pricing (`priceOverride` null → `basePrice`) unless the request sets `price`; images are untouched. Empty selection yields one default variant with base-identity SKU (`{BRAND}-{CATEGORY}-{STYLE}`).
- **Result**: `{ created, existing, skipped, errors, summary }`; `dryRun: true` previews SKUs without persisting (Phase 3 admin-UI seam).
- **Matrix writes** (Phase 3): `PATCH /admin/products/:productId/variants` (bulk price/status, ≤300 rows, one transaction, per-row `PRICE_CHANGED`/`VARIANT_UPDATED` audits) and `POST /admin/inventory/restock-batch` (≤100 items, one transaction, per-item `IN` movements, single summary audit). Per-row stock corrections on persisted variants reuse the single `adjust` endpoint (delta computed client-side from loaded on-hand).
- **Manual variant creation** (v8-RC remediation): `POST /admin/products/:productId/variants` accepts legacy `{ attributeId, value }` plus `{ attributeValueId }` / `{ attributeId, attributeValueId }` entries, resolves them against existing `AttributeValue` rows (never auto-creates), and persists variant + `VariantAttributeValue` mappings + zeroed inventory + structured `VARIANT_CREATED` audit in one transaction. Missing mappings are rejected for any status (`400 VARIANT_ATTRIBUTES_REQUIRED`); unknown values, cross-attribute mismatches, repeated attributes, and duplicate combinations are rejected; reused SKUs report `409 SKU_ALREADY_EXISTS`. The publish readiness gate still refuses any mapping-less variant. See `docs/V8-RC-ARCHITECTURE-NOTES.md`.

## Admin Variant Management UI (Phase 3)

`apps/web/components/VariantManager.tsx` (shared by product create `admin/products/new` and edit `admin/products/[id]`) + pure helpers in `apps/web/lib/variant-matrix.ts`:

- **Attribute selection**: dimensions picked from backend-loaded attributes (identity `BRAND` excluded); category `skuTemplate` tokens shown as required-dimension hints. Changing category resets dimensions (they are category-scoped).
- **SKU preview**: debounced (500ms) `dryRun` generation — the only SKU source; SKUs render read-only and are never editable. No SKU logic in the frontend (only display-only `{TOKEN}` parsing for hints).
- **Matrix**: existing/new/skipped rows with sticky first column on desktop, horizontally scrollable wrapper on tablet, card transformation (`data-label`) on mobile. Out-of-stock renders as text (never color-only). Single-variant products show one default row.
- **Pricing/stock**: per-row inputs with KES/whole-unit validation; bulk stage-to-selected + save; creation flow writes via generate → batch price PATCH → batch restock (3 requests max regardless of variant count). Existing-variant stock edits compute adjust deltas from loaded on-hand.
- **Safety**: existing variants preserved (idempotent backend); de-selected combos excluded via `allowList` (never deleted); archive/restore through `JBConfirmDialog` (`ConfirmAction`); SKUs immutable in UI; unsaved-draft `beforeunload` guard retained on the create page.

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

## Barcode & Product Identification (Phase 5)

SKU stays the internal/business identifier; barcode is the machine-readable operational key for the same `ProductVariant` (`barcode` nullable unique — NULL allowed until assignment; DB constraint is the final authority; never `barcode = SKU`).

- **Standards**: assigned codes may be EAN-13, UPC-A, CODE128 or CODE39, validated per standard (EAN-13/UPC-A check digits verified, never length-only; type-aware normalization preserves significant Code 128/39 characters). Internal auto-generation produces EAN-13 in the GS1 restricted-circulation range (prefix `29`, store-use only) via crypto-random payload + valid check digit — explicitly NOT official GTINs. QR deferred.
- **Service** (`apps/api/src/lib/barcode.ts`, pure validation + Prisma-backed claims): server-authoritative generate (atomic `barcode: null` claim + bounded retry on collisions), manual assign with source (`INTERNAL/MANUFACTURER/SUPPLIER/IMPORTED/MANUAL`), explicit `replace: true` + reason for overwrites (audited before/after via `VARIANT_UPDATED` — no second log), bulk generate-missing (never touches existing codes), grouping-tolerant lookup → variant + SKU + inventory.
- **Endpoints** (operations staff): `POST …/variants/:variantId/barcode/generate|/assign`, `POST …/variants/barcodes/generate-missing` (≤100), `GET /admin/inventory/lookup?barcode=`; inventory search also matches barcodes.
- **Admin UI**: barcode column + per-row/bulk generate in the variant matrix; Scan Station (`/admin/inventory/scan`) for keyboard-wedge scanners (result card, replace-with-reason, unknown-code handling, label queue with quantities and optional price, print stylesheet); EAN-13/UPC-A labels render as exact-module SVG with human-readable digits. Camera scanning deferred (no library installed; keyboard baseline per project principles). Barcodes are never shown on the customer storefront.
