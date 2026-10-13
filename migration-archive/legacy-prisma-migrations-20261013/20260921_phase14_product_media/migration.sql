-- Phase 14: Product media (Cloudinary provider metadata on ProductImage)
-- Safe, non-destructive, additive-only migration.
-- - New nullable provider columns: legacy/external `url` rows keep working.
-- - `updatedAt` backfilled with CURRENT_TIMESTAMP (zero existing rows verified).
-- - Partial unique index enforces at most one primary image per product
--   (Prisma cannot express WHERE on @@unique; enforced here + transactionally).
-- - Ordered-read index on (productId, sortOrder).

ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "publicId" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "secureUrl" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "bytes" INTEGER;
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductImage_product_primary_unique" ON "ProductImage"("productId") WHERE "isPrimary" = true;
