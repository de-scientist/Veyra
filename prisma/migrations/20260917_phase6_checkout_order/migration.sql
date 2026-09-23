-- Phase 6: checkout, order snapshots, inventory reservations, and idempotency.

ALTER TABLE "Order"
ADD COLUMN "customerName" TEXT,
ADD COLUMN "confirmationTokenHash" TEXT;

CREATE UNIQUE INDEX "Order_confirmationTokenHash_key" ON "Order"("confirmationTokenHash");

CREATE TABLE "CheckoutIdempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "CheckoutIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutIdempotency_key_key" ON "CheckoutIdempotency"("key");
CREATE UNIQUE INDEX "CheckoutIdempotency_orderId_key" ON "CheckoutIdempotency"("orderId");
CREATE INDEX "CheckoutIdempotency_scope_createdAt_idx" ON "CheckoutIdempotency"("scope", "createdAt");
CREATE INDEX "CheckoutIdempotency_userId_createdAt_idx" ON "CheckoutIdempotency"("userId", "createdAt");

ALTER TABLE "CheckoutIdempotency"
ADD CONSTRAINT "CheckoutIdempotency_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CheckoutIdempotency"
ADD CONSTRAINT "CheckoutIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
