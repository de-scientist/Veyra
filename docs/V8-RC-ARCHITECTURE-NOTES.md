# V8-RC Architecture Notes — JB Mercantile

Companion to `docs/V8-RC-LIMITATIONS-REMEDIATION-REPORT.md` and
`docs/V8-RC-VALIDATION-MATRIX.md`. Records the architectural decisions that
constrain the v8-RC remediation: what was deliberately NOT changed and why.

## 1. Schema strategy — no migration in v8-RC

```text
Schema unchanged.
Existing generated Prisma client retained.
Existing event/audit mechanism extended where required.
```

Why:

- The Prisma schema (`prisma/schema.prisma`) already models the full variant
  integrity chain: `Product → ProductVariant → VariantAttributeValue →
  AttributeValue → Attribute`, with `@@unique([variantId, attributeId,
  attributeValueId])` on the mapping table and a unique `sku` on the variant.
  No schema change is needed to persist attribute mappings — the manual
  `POST /variants` endpoint simply never wrote to the existing table.
- The v8-RC Prisma CLI in this environment cannot safely regenerate the
  client (`prisma validate` is not even a registered command in the pinned
  `8.0.0-rc.15` CLI; the prior phase likewise found no `psql` and no safe
  generate path). A hand-edited migration + stale client would risk runtime
  drift between schema, database, and client.
- Verification instead of migration: `git diff` shows zero changes under
  `prisma/`; the full API suite (including new `VariantAttributeValue`
  writes/reads) passes against the live PostgreSQL database, proving
  schema = database = generated client for every touched path.

## 2. Event strategy — existing audit actions reused

The audit mechanism is `AuditLog` with the closed `AuditAction` enum (new
enum values require a migration, so none were added).

- Manual variant creation now emits `VARIANT_CREATED` — the same action the
  bulk generate flow (`variant-generation-service.ts`) already emits — with
  a structured, additive `after` payload:

```json
{
  "entity": "ProductVariant",
  "productId": "...",
  "operation": "VARIANT_CREATED",
  "variantId": "...",
  "sku": "...",
  "price": 4500,
  "status": "ACTIVE",
  "attributeMappings": [
    { "attributeId": "...", "attributeValueId": "...", "value": "Black" }
  ]
}
```

- Backwards compatibility: consumers key on the `action` / `entity` /
  `entityId` columns, which are unchanged in type and continue to hold
  values from the closed enum. The structured detail lives inside the
  existing `after` JSON column next to the pre-existing shapes
  (`{ sku }`, `{ status, publishRejected, issues }`, `{ draft: true }`,
  `{ collections: [...] }`). No consumer query changes are required.
- Previously manual creation emitted `VARIANT_UPDATED` with `{ sku }` only.
  Aligning it to `VARIANT_CREATED` matches the generate flow; the one
  in-repo reader of `VARIANT_UPDATED` (`barcode.test.ts`) covers
  barcode generate/assign paths in `lib/barcode.ts`, which are untouched.
- Payload hygiene: ids + display values + price only. No secrets, no
  credentials, no PII beyond what the domain already stores.

`PRODUCT_UPDATED` itself is untouched and remains the product-level event
(publish rejections, draft saves, collection assignment).

## 3. Variant integrity — how mappings are now persisted and validated

`POST /admin/products/:productId/variants` (`apps/api/src/routes/catalogue.ts`):

1. Accepts the legacy `{ attributeId, value }` entries (exact-match
   resolution, never auto-created) plus id-based `{ attributeValueId }`
   and `{ attributeId, attributeValueId }` entries. One contract, no second
   representation; the web client type (`AdminVariantAttributeInput`)
   mirrors it.
2. Resolution rejects: zero mappings (`VARIANT_ATTRIBUTES_REQUIRED`, any
   status), unknown value ids or unknown `(attributeId, value)` pairs
   (`ATTRIBUTE_VALUE_NOT_FOUND`), values belonging to another attribute
   (`INVALID_VARIANT_ATTRIBUTES`), repeated attributes in one request
   (`DUPLICATE_VARIANT_ATTRIBUTES`).
3. Pre-existing SKU check preserved with precedence: a reused SKU reports
   `SKU_ALREADY_EXISTS` even when the combination also collides
   (backwards-compatible error precedence; DB unique constraint remains
   the final authority for races). A repeated attribute combination under
   a fresh SKU reports `409 DUPLICATE_VARIANT_COMBINATION`.
4. Atomic persistence in one `prisma.$transaction`: `ProductVariant` +
   `VariantAttributeValue` rows + zeroed `Inventory` + structured
   `VARIANT_CREATED` audit. Any failure rolls everything back — a variant
   without its mappings can never be left behind.
5. The response includes the created mappings
   (`variantAttributeValues` with `attribute` + `attributeValue`), matching
   the admin detail shape (`GET /admin/products/:id`).

## 4. Publish protection — defense in depth

```text
variant API validation
  → database/domain integrity (unique SKU, mapping @@unique)
    → product readiness validation (checkPublishReadiness)
      → publish authorization (requireOperationsAccess)
        → publish (PATCH status → ACTIVE inside a transaction)
```

The publish readiness gate (`checkPublishReadiness`, enforced in the same
transaction as the status flip) is unchanged and still rejects variants
with zero mappings (`MISSING_ATTRIBUTES`). It is not redundant: it guards
historical malformed rows, imports, administrative edits, and any future
API bug. The variant-API fix stops new malformed rows; the gate catches
everything else.
