-- Phase 9: returns, exchanges, inspections, inventory disposition, and refunds.

CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','RETURN_INITIATED','RECEIVED','INSPECTING','APPROVED_FOR_RESOLUTION','RESOLVED','CANCELLED');
CREATE TYPE "ReturnType" AS ENUM ('REFUND','EXCHANGE');
CREATE TYPE "ReturnCondition" AS ENUM ('UNKNOWN','NEW','LIKE_NEW','USED','DAMAGED','DEFECTIVE','UNSELLABLE');
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK','QUARANTINE','DAMAGED','UNSELLABLE');
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED','PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED');
CREATE TYPE "ExchangeStatus" AS ENUM ('REQUESTED','APPROVED','ALLOCATED','FULFILLING','COMPLETED','FAILED','CANCELLED');

CREATE TABLE "ReturnRequest" (
  "id" TEXT NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ReturnType" NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "customerNote" TEXT,
  "rejectionReason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnRequest_returnNumber_key" ON "ReturnRequest"("returnNumber");
CREATE INDEX "ReturnRequest_orderId_status_idx" ON "ReturnRequest"("orderId", "status");
CREATE INDEX "ReturnRequest_userId_createdAt_idx" ON "ReturnRequest"("userId", "createdAt");
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");

CREATE TABLE "ReturnItem" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "condition" "ReturnCondition" NOT NULL DEFAULT 'UNKNOWN',
  "disposition" "ReturnDisposition",
  "inspectionNote" TEXT,
  "refundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "restockApplied" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnItem_returnRequestId_orderItemId_key" ON "ReturnItem"("returnRequestId", "orderItemId");
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");

CREATE TABLE "ReturnStatusHistory" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "fromStatus" "ReturnStatus",
  "toStatus" "ReturnStatus" NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReturnStatusHistory_returnRequestId_createdAt_idx" ON "ReturnStatusHistory"("returnRequestId", "createdAt");

CREATE TABLE "Exchange" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "originalOrderItemId" TEXT NOT NULL,
  "originalVariantId" TEXT,
  "replacementVariantId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "ExchangeStatus" NOT NULL DEFAULT 'REQUESTED',
  "priceDifference" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Exchange_returnRequestId_key" ON "Exchange"("returnRequestId");
CREATE INDEX "Exchange_status_createdAt_idx" ON "Exchange"("status", "createdAt");

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "refundNumber" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "returnRequestId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "provider" "PaymentProvider" NOT NULL DEFAULT 'MPESA',
  "providerReference" TEXT,
  "reason" TEXT NOT NULL,
  "failureReason" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdBy" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Refund_refundNumber_key" ON "Refund"("refundNumber");
CREATE UNIQUE INDEX "Refund_returnRequestId_key" ON "Refund"("returnRequestId");
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");
CREATE INDEX "Refund_orderId_status_idx" ON "Refund"("orderId", "status");
CREATE INDEX "Refund_paymentId_status_idx" ON "Refund"("paymentId", "status");
CREATE INDEX "Refund_provider_providerReference_idx" ON "Refund"("provider", "providerReference");

CREATE TABLE "RefundTransaction" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerReference" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "rawResponse" JSONB,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RefundTransaction_refundId_createdAt_idx" ON "RefundTransaction"("refundId", "createdAt");
CREATE INDEX "RefundTransaction_provider_providerReference_idx" ON "RefundTransaction"("provider", "providerReference");

ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnStatusHistory" ADD CONSTRAINT "ReturnStatusHistory_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_originalOrderItemId_fkey" FOREIGN KEY ("originalOrderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_originalVariantId_fkey" FOREIGN KEY ("originalVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_replacementVariantId_fkey" FOREIGN KEY ("replacementVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundTransaction" ADD CONSTRAINT "RefundTransaction_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
