-- Phase 12: Admin & Operations Platform
-- Safe, non-destructive, additive-only migration: new audit actions + admin query indexes.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COLLECTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COLLECTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTRIBUTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COUPON_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COUPON_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REVIEW_MODERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VARIANT_UPDATED';

CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_fulfillmentStatus_createdAt_idx" ON "Order"("fulfillmentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
