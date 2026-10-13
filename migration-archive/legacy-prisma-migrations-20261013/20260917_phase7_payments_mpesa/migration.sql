-- Phase 7: provider payment attempts and M-Pesa callback correlation.

ALTER TABLE "PaymentTransaction"
ADD COLUMN "providerMerchantRequestId" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'KES',
ADD COLUMN "failureReason" TEXT;

CREATE UNIQUE INDEX "Payment_orderId_provider_key" ON "Payment"("orderId", "provider");
CREATE INDEX "PaymentTransaction_provider_providerRequestId_idx" ON "PaymentTransaction"("provider", "providerRequestId");
CREATE INDEX "PaymentTransaction_provider_providerMerchantRequestId_idx" ON "PaymentTransaction"("provider", "providerMerchantRequestId");
CREATE INDEX "PaymentTransaction_provider_providerTransactionId_idx" ON "PaymentTransaction"("provider", "providerTransactionId");
CREATE UNIQUE INDEX "PaymentTransaction_provider_idempotencyKey_key" ON "PaymentTransaction"("provider", "idempotencyKey");
