# JB Mercantile — Product Creation & Pricing UX Report

Date: 2026-10-09. Scope: simplified product creation + dedicated Pricing & Stock
management on the existing JB Mercantile platform. No database reset, no second
pricing source of truth, no new backend pricing model. Status labels follow
`AGENTS.md` (IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED /
NOT VERIFIED / BLOCKED / FUTURE).

Companion documents: `docs/BUSINESS-DECISIONS.md` (BD-001–BD-012),
`docs/JB-MERCANTILE-MANUAL-IMPLEMENTATION-RECONCILIATION.md`,
`docs/JB-MERCANTILE-ADMIN-USER-MANUAL.md` v1.2 (updated in this phase).

---

## 1. Existing workflow and identified usability problems

Repository state before this phase (verified by source inspection):

- Framework: Next.js **14.2.15** (route params synchronous — the historical
  `params.then` issue is already fixed and guarded by
  `apps/web/lib/route-params.test.ts`), React 18, Fastify API under
  `/api/v1`, Prisma + PostgreSQL, signed Cloudinary uploads.
- Creation route `/admin/products/new` was a draft-first workspace with seven
  panels: Basic information (name, slug, description, category, status),
  Product media, Variants/SKUs/pricing, Categories & collections, Attributes,
  SEO, Review & publish, plus progress/preview sidebars.
- Edit route `/admin/products/[id]` used different headings ("Product
  information", "Variants & pricing (N)") and a thin Inventory card — no
  pricing-first section on either page.

Usability problems found:

1. **Complicated first impression.** Before saving anything, an administrator
   faced slug editing, a status dropdown, attribute-dictionary panels, and an
   SEO card — technical concepts (attribute dictionaries, variant matrices,
   SKU templates) before the first save.
2. **No simple price path.** Setting a price required opening the variant
   matrix, understanding dimensions, brand codes, and category dictionary
   codes, even for a single-item product. There was no "selling price" input
   for the common case.
3. **Single-variant friction hidden.** The supported default-variant workflow
   (`POST …/variants/generate` with `attributes: {}`) exists, but the UI never
   offered it: the matrix demanded dimension selection first, and generation
   still requires a coded category + a brand (see §9 — documented, not
   removed).
4. **No previous-price field.** `compareAtPrice` is backend-supported
   (schemas, batch, storefront was/now display) but had no dashboard input
   (BD-005).
5. **Toast-only errors in the matrix.** Per-row failures appeared only as
   toasts; bulk price staging had no confirmation step.
6. **Stock language technical.** On-hand/reserved/available was correct but
   unexplained; new variants starting at zero surprised staff.
7. **Create/edit parity gaps.** Different section names, no shared pricing
   rules explanation, immutable fields (slug, SKU) not consistently marked.

---

## 2. Implemented UX changes

Files created:

- `apps/web/components/PricingStockSection.tsx` (new) — dedicated
  **Pricing & Stock** section + `OptionsToggle` + `availabilityLabel`
  re-export.

Files changed:

- `apps/web/components/VariantManager.tsx` — compare-at column, inline row
  errors, bulk previous-price staging, confirmation steps, plain-language
  column headings.
- `apps/web/lib/variant-matrix.ts` — `compareAtPrice` plumbed through
  `MatrixRow`/`mergePreviewRows`/`existingVariantRows`; new pure
  `availabilityLabel()` helper.
- `apps/web/lib/variant-matrix.test.ts` — 5 new tests (see §8).
- `apps/web/app/admin/products/new/page.tsx` — rebuilt into five guided
  sections (see §3).
- `apps/web/app/admin/products/[id]/page.tsx` — same five sections, same
  pricing rules, immutable fields marked read-only.
- `docs/JB-MERCANTILE-ADMIN-USER-MANUAL.md` — v1.2, every changed label and
  flow re-verified against the final implementation.

No API, Prisma schema, migration, or RBAC change was required or made. The
backend is byte-for-byte the same code paths the reconciliation report
verified.

New creation page structure:

1. **Product Details** — name *, category *, description *. No slug field
   (auto-generated, shown as read-only "Web address", immutable note). No
   status dropdown (always DRAFT; shown in section 5).
2. **Images** — same signed Cloudinary `ProductMediaManager` (drag-drop,
   browse, progress, retry, primary, reorder, alt text, remove/replace),
   with a plain-language requirements line (JPEG/PNG/WebP; ≥1 photo + primary
   needed to publish).
3. **Pricing & Stock** — the new section (see §3).
4. **Options & Variants** — `OptionsToggle` ("This product has options or
   variations") + explainer; the `VariantManager` (option builder + readable
   item table) renders only when options are on. Attribute examples (Size,
   Colour, Shoe size, Capacity, Material, Power) are illustrative; dimensions
   remain data-driven from the category template.
5. **Organisation & Visibility** — status display (Draft), optional
   collections with explicit save, Manage Collections link. The standalone
   Attributes and SEO cards were removed (attributes surface inside Options;
   the address/preview already show the derived SEO).

The edit page mirrors all five sections with identical pricing rules, plus a
**Stock summary** sidebar (per-item price + In stock / Low stock /
Out of stock) and an Activity & metadata card marking IDs, web address, and
SKUs as immutable.

Design system compliance: existing theme tokens, buttons, `JBIcon`,
`useConfirm`/`JBConfirmDialog` (never `window.confirm`), toast + inline
alerts (never `window.alert`), no reloads, no new UI library, responsive
table wrapper with `data-label` cells, labelled inputs with
`aria-invalid`/`aria-describedby`, keyboard-operable controls.

---

## 3. New Pricing & Stock workflow

Section **3 · Pricing & Stock** is present on creation and editing. It has two
modes driven by one toggle, **"This product has options or variations"**:

**Single item (toggle off).** Controlled inputs:

- Selling price (KES) * — required, must be above KES 0.
- Previous price (KES) — optional; crossed-out display only when higher than
  the selling price.
- Quantity in stock * — required whole units (0 allowed).
- Brand * (dropdown when a Brand attribute exists, else brand-code input) —
  shown only until the item exists; it feeds automatic SKU generation.
- Read-only SKU (or "Generated automatically when you save") and Availability
  (**In stock** / **Low stock** / **Out of stock** + available count), with the
  note "Available stock = units on hand minus reservations for open orders."
- Save button (**"Save price & create item"** / **"Save price & stock"**):
  disabled while saving (no duplicate submissions), values preserved on
  failure, success announced only after server confirmation.

**Options on.** The section shows a per-item price summary with an anchor to
**4 · Options & Variants**, which hosts the full option builder + item table:

| Item | Selling price (KES) | Previous price (KES) | Stock |
|---|---|---|---|
| Black / Small (illustrative) | editable per row | editable per row | editable per row |

(Table caption: "Product items with SKU, selling price, previous price and
stock". Real variant attributes are displayed per row; missing/invalid prices
are flagged beside the affected row; bulk price/previous/stock staging to
ticked rows requires confirmation; server writes use the batch endpoints —
never one request per item, never a bypass of validation or authorisation.)

---

## 4. Price persistence and data-model explanation

Authoritative model (unchanged — this phase adds UI only):

- `ProductVariant.priceOverride` (`Decimal(10,2)`, nullable) is the
  **authoritative selling price**. Storefront, cart, checkout, and order
  snapshots all resolve `priceOverride ?? Product.basePrice ?? 0`
  (`apps/api/src/lib/storefront.ts:109`, `shopping.ts:91`, `checkout.ts:76`).
- `Product.basePrice` is a nullable display fallback, **not settable from any
  admin UI or product schema** (seed/support only). This phase does not add a
  product-level price field (BD-004 — see §9).
- `ProductVariant.compareAtPrice` (nullable) is the optional previous price;
  the storefront renders was/now strikethrough only when
  `compareAtPrice > price`. This phase surfaces the existing column; it adds
  no column and no discount policy (BD-005 — see §9).
- Every purchasable item is a variant. A product without options uses the
  **default variant** created through the existing supported workflow:
  `POST /admin/products/:id/variants/generate` with `attributes: {}` (pure
  planner `planGenerationFromRecords`, single-variant template
  `{BRAND}-{CATEGORY}-{STYLE}`, transactional persistence + zeroed inventory +
  `VARIANT_CREATED` audit).
- Price writes use only existing authorised endpoints: generate-time `price`,
  single `PATCH …/variants/:id` (`price`, `compareAtPrice`), and batch
  `PATCH …/variants` (one transaction, per-row audit `PRICE_CHANGED` /
  `VARIANT_UPDATED`). No direct database mutation from the browser; every
  sensitive operation re-checks operations access server-side
  (`requireOperationsAccess`) and is independently permission-enforced.

---

## 5. Product and variant pricing behaviour

- **Simple product:** the section creates the default variant with the entered
  price (and previous price when given), then records opening stock as an
  audited `IN` movement (`restock-batch`) when quantity > 0. Editing reuses
  batch price update + `adjust` correction. SKU is server-generated and shown
  read-only; duplicate combinations are impossible (planner reports existing
  instead of duplicating; DB unique constraint wins races).
- **Variant products:** the item table edits selling + previous prices per row
  and saves through the batch endpoint with a confirmation dialog
  ("Save prices for {N} item(s)?"). New rows require a selling price above
  KES 0 (publish requires `price > 0` per ACTIVE variant); previous prices
  stay optional and are never fabricated (preview/new rows default to null).
- **Validation (frontend mirrors, backend enforces):** required selling price
  per purchasable item; numeric; no negatives; ≤2 decimals
  (`validatePriceInput`, shared by simple + matrix); ≤ 99,999,999.99; whole
  non-negative stock ≤ 100,000 (`validateStockInput`); no silent conversion
  or rounding (over-precise input is rejected, not rounded — tested).
- **Consistency:** admin saves, catalogue, cart, checkout, and order snapshots
  read the same `priceOverride` column; this phase changes no commerce path,
  and the full API suite (catalogue, variant-manual, variant-batch,
  variant-generation, commerce, storefront) passes.

---

## 6. API and database changes

**None.** No route, schema, migration, enum, or permission change. Deliberately:

- The requested experience (simple price entry, per-item pricing, previous
  price, stock via movements, draft/publish gates) is fully expressible with
  existing endpoints: product CRUD + draft autosave, variant
  generate/manual/single/batch, inventory restock/restock-batch/adjust, media
  lifecycle, collections assignment.
- Adding a `Product.basePrice` editor or a new pricing column would have
  created the second source of truth the task forbids and pre-empted BD-004.
  It was not done.
- The previous-price UI writes the **existing** `compareAtPrice` column
  through the **existing** variant schemas — a surfacing of current backend
  capability, not a new behaviour (BD-005 ownership still open — see §9).

---

## 7. Permissions and validation

- Pages remain under the existing admin/operations gate; all product, pricing,
  and inventory endpoints require operations access server-side. The frontend
  `can()` helper is UX-only. No parallel role/permission system was created.
- IDOR/BOLA: variant/inventory operations scope every id to its product
  (`findFirst({id, productId})`, batch membership checks, transaction-scoped
  updates). Batch restock/price payloads reject duplicate ids and
  cross-product ids (404). No client-submitted totals or permission flags are
  trusted.
- Publish/draft rules unchanged and server-authoritative:
  `checkPublishReadiness` runs transactionally on every non-ACTIVE → ACTIVE
  transition (name, slug, category, description ≥12, ≥1 ACTIVE variant with
  SKU + price > 0 + attributes, ≥1 image + primary). Direct-ACTIVE creation is
  rejected with structured issues; failed publishes change nothing and are
  audit-logged.
- Audit: product created/updated/archived, `PRICE_CHANGED`/`VARIANT_UPDATED`/
  `VARIANT_CREATED`, `INVENTORY_ADJUSTED`, image lifecycle events — all
  retained. No cost/financial fields are exposed beyond the selling/previous
  prices staff already managed.
- UX guards: confirmations for options toggle, variant creation, price saves,
  bulk staging, archive/restore, image delete; duplicate-submission disabled
  states; `beforeunload` + `JBConfirmDialog` for unsaved changes (no
  `window.confirm`, no `window.location.reload`).

---

## 8. Tests and build results

New/updated tests (`apps/web/lib/variant-matrix.test.ts`, 17 tests, all
passing):

- Price precision: exact 2-decimal preservation; 3-decimal rejection (no
  silent rounding); zero handling.
- Previous-price semantics: empty = valid "no sale"; same KES rules when
  present; never fabricated on preview/new rows; carried through existing
  rows.
- Availability language: Not stocked yet / Out of stock (incl. fully
  reserved) / Low stock (at/under threshold) / In stock.

Results (executed 2026-10-09):

- `npm run typecheck --workspace @veyra/web` — **PASS**.
- `npm run typecheck --workspace @veyra/api` — **PASS** (no backend change).
- `npm run lint --workspace @veyra/web` — **0 errors** (only pre-existing
  `<img>` warnings in untouched files).
- `npx vitest run apps/web/lib/variant-matrix.test.ts
  apps/web/lib/product-publish.test.ts` — **25/25 PASS**.
- Full `npx vitest run` — **489 passed, 2 failed** on first run, both
  5-second timeouts under parallel load: `auth.test.ts` (bcrypt hash ~5s)
  and `commerce.test.ts` inventory-concurrency. Both **pass in isolation**
  (auth 3/3; commerce 16/16) — the same flaky pattern the 2026-10-07
  reconciliation report documents (its run: 484 + 2 flaky). No genuine
  failure; no test was skipped or weakened.
- `npm run build --workspace @veyra/web` — **PASS** (all routes compiled).
- `npm run build --workspace @veyra/api` — **PASS** (tsc emit).

Regression areas rechecked by existing suites (all passing): dynamic route
params (`route-params.test.ts`), `currentTarget.value` event handling
(pattern retained in both pages — values captured synchronously before state
updaters), Cloudinary upload retry flow (unchanged `ProductMediaManager` +
`media-upload.test.ts`), hydration (no new SSR/client boundary introduced —
new component is client-only inside client pages), create/edit parity (shared
`PricingStockSection`/`VariantManager`), catalogue/cart/checkout/storefront
(API suites green).

---

## 9. Known limitations and outstanding business decisions

1. **BD-004 (REQUIRES BUSINESS DECISION) — pricing model ownership.** The UI
   now teaches variant-price-only operation honestly, but the owner has never
   explicitly confirmed it, nor whether `basePrice` should ever become
   editable. No base-price field was added. Smallest safe path if the owner
   wants one: a single authorised `basePrice` editor on the product with
   fallback-semantics documentation — a future feature, not this phase.
2. **BD-005 (REQUIRES BUSINESS DECISION) — discount policy.** The previous-
   price inputs in this phase expose the *existing* backend column; they do
   not decide when JB Mercantile advertises discounts. The manual (§15.2,
   Ch. 29) tells staff to leave previous prices empty without an agreed
   policy. Owner still to confirm: (a) no was/now, or (b) was/now with rules.
3. **Simple-product SKU prerequisites (documented gap, no backend change).**
   Even the single-item path requires a **coded category** (2–5 chars,
   `Catalogue → Categories → Edit → SKU code`) and a **brand** (Brand value
   or 2–6 char code), because `planGenerationFromRecords` requires both for
   every generation, including single-variant. The UI surfaces these as
   plain-language inline errors with the fix path instead of structured 400s.
   Smallest safe solution if the business wants zero-config singles: allow
   generation with a documented fallback brand/category segment — that is a
   backend rule change needing owner sign-off (it alters SKU shapes), so it
   was documented, not implemented.
4. **Stock corrections via product page use `adjust`** (single movement with
   reason "Product setup stock correction"); large/repeat corrections belong
   in Inventory. Releasing reserved stock still requires order processing —
   by design.
5. **Bulk price application** stages locally then persists via the confirmed
   batch save; there is no scheduled or partial bulk (all-or-nothing
   transaction — a bulk with one invalid row saves nothing and flags the
   row).
6. **Browser/E2E verification: NOT VERIFIED.** No browser tooling is
   available in this environment; all flows above are verified by
   typecheck/lint/unit suites, build success, and code inspection. First-time
   publishers should keep devtools open and report anomalies (manual Ch. 29).

---

## 10. Browser/E2E verification status

**NOT VERIFIED** — no live-browser E2E tooling exists in this environment
(same constraint as the 2026-10-07 reconciliation). Compensating evidence:
production builds pass, automated suites pass (see §8), and every documented
UI string in §13 below was copied from the final source, not from memory.
Do not claim browser tests passed.

---

## 11. Instructions for an administrator to add a simple product

1. Sign in, open the Admin Dashboard → **Catalogue → Products** →
   **"New Product"**.
2. **1 · Product Details:** enter Product name, choose Category, write a
   Description (≥12 characters). The Web address is automatic.
3. Select **"Save Draft"** → *"Draft created. Add images, then set the price
   and stock."*
4. **2 · Images:** drag photos (or **"choose files"**; JPG/PNG/WebP), wait
   for **"Saved"** on each. Keep the best photo first (primary).
5. **3 · Pricing & Stock** (leave **"This product has options or
   variations"** off): enter **Selling price (KES)**, leave **Previous
   price** empty (no sale), enter **Quantity in stock**, choose **Brand** (or
   type a brand code), then **"Save price & create item"** → price-saved
   confirmation. The SKU appears read-only with **In stock — {N} available**.
6. **5 · Organisation & Visibility:** tick collections if wanted →
   **"Save collections"**.
7. Sidebar **Review & publish**: when every item is ticked, select
   **"Publish product"** → *"Product published."* → **"View storefront"** to
   verify.

## 12. Instructions for an administrator to add a product with variants

Follow §11 steps 1–4, then:

5. **4 · Options & Variants:** tick **"This product has options or
   variations"** (confirm **"Show options"**).
6. **"+ Add variant option"** → **"Add"** per dimension (e.g. Colour, Size);
   tick values; complete Brand; read the summary (*"2 Colours × 3 Sizes"*)
   and preview (*"{new} new · {existing} existing · {skipped} skipped"*).
7. Enter each new row's **Selling price** (*"Required, e.g. 2500"*) and
   optional **Previous price**; optionally stage a common value with
   **"Bulk price (KES)"** + **"Apply to {N} selected"** (confirm
   **"Stage values"**).
8. Select **"Create {N} variant(s)"**, confirm **"Create variants"** →
   *"Created {c} variant(s)…"*. Enter per-row stock; save prices with
   **"Save price changes"** (confirm **"Save prices"**).
9. Continue with §11 steps 6–7 (collections, review, publish, verify).

## 13. Instructions for updating the price of an existing product

- **Single item:** open the product → **3 · Pricing & Stock** → type the new
  **Selling price (KES)** (and **Previous price** when running a genuine
  sale) → **"Save price & stock"** → success confirmation. The change is
  audited and applies to future purchases only; past orders keep their
  snapshots.
- **An item among options:** open the product → **4 · Options & Variants** →
  type the **New price** beside the item's row (previous price likewise) →
  **"Save price changes"** → confirm **"Save prices"**. For several items,
  tick rows, stage **"Bulk price (KES)"**, review, then save.
- Failed saves keep your entries and explain the problem (inline + message);
  only retry once after correcting.

---

*End of report. Implementation: verified results (§8) are distinguished from
code-review-only findings (§10) above. BD-004/BD-005 remain explicitly open
(§9).*
