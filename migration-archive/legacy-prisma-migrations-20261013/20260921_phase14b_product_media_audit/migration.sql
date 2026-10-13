-- Phase 14b: Product media audit actions
-- Additive-only enum extension (precedent: phase13 analytics migration).
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block; each
-- statement below is applied independently.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE_REORDERED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE_REPLACED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_IMAGE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PRODUCT_PRIMARY_IMAGE_CHANGED';
