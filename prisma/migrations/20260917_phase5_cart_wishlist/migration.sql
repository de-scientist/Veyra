-- Phase 5: shopping intent layer
-- Cart does not reserve inventory. Cart prices are provisional snapshots.

ALTER TABLE "CartItem"
ADD COLUMN "unitPriceSnapshot" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE "CartItem"
ALTER COLUMN "unitPriceSnapshot" DROP DEFAULT;

ALTER TABLE "Cart"
ADD CONSTRAINT "Cart_userId_key" UNIQUE ("userId");

ALTER TABLE "Cart"
ADD CONSTRAINT "Cart_sessionId_key" UNIQUE ("sessionId");

ALTER TABLE "Wishlist"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WishlistItem"
ADD COLUMN "productId" TEXT;

UPDATE "WishlistItem" AS item
SET "productId" = variant."productId"
FROM "ProductVariant" AS variant
WHERE item."variantId" = variant."id";

ALTER TABLE "WishlistItem"
DROP CONSTRAINT "WishlistItem_variantId_fkey";

DROP INDEX "WishlistItem_wishlistId_variantId_key";

ALTER TABLE "WishlistItem"
ALTER COLUMN "productId" SET NOT NULL;

ALTER TABLE "WishlistItem"
DROP COLUMN "variantId";

CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_key" ON "WishlistItem"("wishlistId", "productId");
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

ALTER TABLE "WishlistItem"
ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Cart_status_expiresAt_idx" ON "Cart"("status", "expiresAt");
