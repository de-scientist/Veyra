# JB Mercantile — Product Variant Pricing & Stock Defaults (IMPLEMENTED)

Status: **IMPLEMENTED** (verified 2026-10-13 — typecheck, lint, unit + DB tests, web build all executed).

## 1. Existing architecture (audit findings)

- **Source of truth:** `ProductVariant.priceOverride` (selling price) + `ProductVariant.compareAtPrice` (previous/strike price, nullable) + `Inventory{quantityOnHand, quantityReserved}` per `variantId` (`prisma/schema.prisma:496-521, 551-588, 634-646`). `Product.basePrice` is a nullable display fallback only — never written by any admin endpoint — and `Product` has no stock columns.
- **Price resolution (unchanged):** `priceOverride ?? basePrice ?? 0` (`apps/api/src/lib/storefront.ts:109`, `shopping.ts`, `checkout.ts`). Sale display only when `compareAtPrice > price`. No `isCustom`/inheritance column exists; inheritance was previously runtime fallback only.
- **Writes:** `POST /api/v1/admin/products` (draft only, no variants), `POST .../variants/generate` (bulk, `price`/`compareAtPrice` applied uniformly, zeroed inventory), `PATCH .../variants` (batch price, transactional), `POST /admin/inventory/restock-batch` (IN movements), `POST /admin/inventory/:variantId/adjust` (ADJUSTMENT). Manual variant creation is transactional (variant + mappings + zeroed inventory + audit). Product creation and variant creation are separate requests (pre-existing; not merged).
- **SKU:** server-authoritative (`apps/api/src/lib/sku.ts`, `variant-generation.ts`, `variant-generation-service.ts`); DB `UNIQUE(sku)` final authority; SKU immutable after creation. Web `variant-matrix.ts` deliberately contains no SKU generation.
- **UI:** `VariantManager.tsx` (matrix editor, debounced `dryRun` preview, `mergePreviewRows`, staged `rowEdits`, generate → batch price → batch restock) + `PricingStockSection.tsx` (single-variant fast path). No form library; `useConfirm`/`JBConfirmDialog`, `JBIcon`, `useToast`, theme tokens; no `window.confirm`/emoji icons. shadcn/ui present under `components/ui` but not used by these pages (left as-is per scope guard).
- **Previous-price rule before this change:** none — schemas accepted any `compareAtPrice >= 0`, including `0` or below selling price. All seeds/tests used `compareAt > price` by convention only.
- **Tests:** vitest (`vitest.config.ts` root + `apps/api/vitest.config.ts`); DB route tests require Postgres + `.env`.

## 2. Changes (smallest safe implementation — no migration)

No schema change. No new endpoints. No new UI system. Inheritance is **form-level**: an empty per-row input means "inherited"; a typed value means "custom". The backend persists only the existing authoritative columns.

### 2.1 Pure helpers (`apps/web/lib/variant-matrix.ts`)
- `distributeStockEvenly(total, count)` — deterministic: `floor(total/count)` each + remainder dealt one unit at a time from the first row in stable order; `sum === total` always.
- `distributeUnallocatedStock({total, keysInOrder, overridden})` — overridden rows keep explicit quantities; only the remainder (`total − Σoverrides`, floored at 0) is shared evenly across inherited rows.
- `summarizeAllocation(total, quantities, count)` — `{total, allocated, unallocated, variantCount}`.
- `validatePricePair(price, compareAt)` — null either side = valid; both present requires `compareAt > price`. Mirrors backend `INVALID_PRICE`.
- Types `VariantDefaults`, `StockStrategy ('even' | 'manual')`, `MAX_TOTAL_STOCK`.

### 2.2 Admin UI (`apps/web/components/VariantManager.tsx`)
- New **Product defaults** fieldset above the matrix: default selling price, default previous price, total stock; strategy radios **Distribute evenly / Enter stock manually**; live allocation summary (total entered · allocated · unallocated · new items); over-allocation warning (nothing discarded); **Distribute evenly** button (clears stock overrides on new rows only — established inventory untouched).
- **New rows:** empty input = inherited (placeholder shows `Inherits KSh X / N`); typed = Custom badge + **Reset** (clears price/compare edits back to inherited). Changing a default updates inherited rows automatically; custom rows never overwritten. Preview rebuilds preserve edits because row keys (`new:SKU` deterministic, `existing:id`) are stable and `rowEdits` is never cleared by previews.
- **Existing rows:** `Established` badge; saved prices/stock never auto-updated; optional **Use default (KSh X)** staging button (deliberate, confirmed via existing save flow). Stock edits remain per-row audited `adjust`; no redistribution of established inventory.
- **Validation:** defaults pair + per-row effective pair checked before generate; staged edits pair-checked before batch save; malformed/negative/fractional inputs rejected with row errors; `handleGenerate` uses effective (inherited or custom) prices/quantities so the persisted sum equals the entered total.

### 2.3 Backend (`apps/api/src/routes/catalogue.ts`)
- Exported `pricePairIssue(price, compareAt)` + `superRefine` on `variantSchema`, `generateVariantsSchema`, `variantUpdateSchema`, `variantBatchSchema`: incoherent pairs → `400 VALIDATION_ERROR` (zod path `compareAtPrice`).
- Handler-level partial-update guards: single `PATCH .../variants/:variantId` and batch `PATCH .../variants` resolve the staged side against the persisted counterpart and throw `400 INVALID_PRICE` on incoherence. Whole batch transaction rolls back on any bad row — no partial writes.
- Auth/RBAC, audit logging (`VARIANT_CREATED`/`PRICE_CHANGED`/`INVENTORY_ADJUSTED`), SKU immutability, inventory safeguards, and error contract (`{success, error:{code,message,details,requestId}}`) unchanged. Atomicity boundaries unchanged (documented limitation below).

## 3. Inheritance & distribution rules (as implemented)
1. New variant selling price = row edit if typed, else product default (must resolve > 0 at creation).
2. New variant previous price = row edit if typed, else product default (optional).
3. Editing a row makes it custom; clearing it (Reset) re-inherits.
4. Changing a default updates only rows still inheriting that field.
5. Pair rule enforced on defaults, effective new-row values, and staged existing-row edits.
6. Stock: total is conserved across **new included rows** (`Σ effective === total` when overrides ≤ total). Overrides preserved; remainder shared evenly in stable row order; manual strategy starts new rows at 0 unless typed; zero-stock rows allowed deliberately; negative/fractional rejected; established inventory never redistributed except via explicit per-row adjust.
7. Removing a variant follows existing safeguards (archive, history preserved); no silent stock transfer. Adding variants later initializes from current defaults with the same explicit workflow.

## 4. Tests & verification (all executed 2026-10-13)
- New/updated: `apps/web/lib/variant-matrix.test.ts` (+8: inheritance placeholder logic, pair rule, 24→[6,6,6,6], 10→[3,3,2,2], remainder order, override preservation, summary) and `apps/api/src/routes/catalogue-pricing.test.ts` (+3: pair rule unit).
- Results: `npx vitest run apps/web/lib/variant-matrix.test.ts` — 24 passed; `catalogue-pricing.test.ts` — 3 passed; combined pure sweep (`apps/web/lib` + catalog/shopping/admin/variant-generation/sku/barcode) — 316 passed; DB suites — `variant-batch` 5 passed, `variant-generation`/`variant-manual`/`catalogue`/`product-lifecycle` 47 passed, `commerce`/`storefront` 24 passed (cart pricing, SKU, inventory, checkout unaffected).
- `npm run typecheck` — api + web clean. `npm run lint` — 0 errors (1 pre-existing api unused-var warning, pre-existing next/img warnings). `npm run build --workspace @veyra/web` — compiled successfully, 60/60 static pages.

## 5. Acceptance mapping
1. Default selling price populates new variants — yes (inherited placeholders + effective writes; unit covered).
2. Default previous price populates new variants — yes (same path; unit covered).
3–4. Total distributed evenly & conserved incl. indivisible totals — yes (`distributeStockEvenly`; 10/4=[3,3,2,2] covered).
5. Independent per-variant price overrides — yes (per-row edits; batch path unchanged).
6. Default updates don't overwrite customs — yes (empty=inherit design; edits keyed stably).
7. Reset to default — yes (Reset clears to inherited; unit + UI).
8. Edit preserves established inventory — yes (existing rows excluded from distribution; `Established` badge; DB suites green).
9. Add/remove without silent loss — yes (allow-list + idempotent generate + archive safeguards; over-allocation warns instead of discarding).
10–11. Invalid prices/stock rejected (client + server, auth intact) — yes (`INVALID_PRICE`/zod + existing guards; RBAC untouched).
12. Atomicity — variant+inventory+audit remain transactional per existing boundaries; batch price/adjust transactional (no new partial-write path introduced).
13. No regressions — verified above.

## 6. Outstanding limitations (not introduced; preserved deliberately)
- Product creation and variant generation remain separate HTTP requests (generate → batch price → batch restock), so a mid-flow failure can leave a product with zeroed-inventory variants; retry/resume via the same matrix (idempotent — existing combos skipped). Merging into a single transactional endpoint was out of scope.
- `Product.basePrice` remains an unused-by-admin nullable fallback; defaults are form-level and not persisted as product columns (avoids migration + second source of truth).
- No `isCustom` column added (least-disruptive choice per brief); inheritance exists only as UI state until persistence, which is sufficient because established rows are never auto-rewritten.
- Previous-price rule is new enforcement (`compareAt > price`); any legacy rows already violating it are untouched (checks run on writes only, never backfilled).
