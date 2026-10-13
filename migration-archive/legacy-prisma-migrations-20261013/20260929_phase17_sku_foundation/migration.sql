-- Phase 17: SKU foundation (domain/database layer)
-- Safe, non-destructive, additive-only migration. Every new column is nullable
-- (or has a default), so existing products, variants, inventory, carts, orders
-- and audit rows keep working untouched. No data is rewritten: existing
-- ProductVariant.sku values are preserved verbatim; dictionary codes and
-- style codes are curated afterwards via admin endpoints / seed backfill.
-- Apply with psql (forward-only discipline, never migrate reset).
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block; each
-- enum statement below is applied independently (precedent: phase14b).

-- Category: stable short code + category-specific SKU template (+ version).
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "skuTemplate" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "skuTemplateVersion" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "Category_code_key" ON "Category"("code");
CREATE INDEX IF NOT EXISTS "Category_code_idx" ON "Category"("code");

-- Product: stable style/model identifier ({STYLE} segment). Nullable: legacy
-- rows and products without a manufacturer style use slug-derived fallback.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "styleCode" TEXT;
CREATE INDEX IF NOT EXISTS "Product_styleCode_idx" ON "Product"("styleCode");

-- AttributeValue: stable short code per attribute scope (Brand/Color/Size/...).
-- Nullable during backfill; unique per (attributeId, code). PostgreSQL treats
-- NULLs as distinct so existing rows never conflict.
ALTER TABLE "AttributeValue" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AttributeValue_attributeId_code_key" ON "AttributeValue"("attributeId", "code");

-- ProductVariant: barcode (separate nullable concept from SKU), frozen template
-- version, and lock timestamp. sku stays the unique sellable-unit identifier.
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "skuTemplateVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "skuLockedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_barcode_key" ON "ProductVariant"("barcode");
CREATE INDEX IF NOT EXISTS "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");
CREATE INDEX IF NOT EXISTS "ProductVariant_sku_idx" ON "ProductVariant"("sku");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- Audit trail for SKU lifecycle events (single AuditLog system, no parallel log).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VARIANT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VARIANT_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_OVERRIDDEN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_VALIDATION_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_DUPLICATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SKU_ARCHIVED';
