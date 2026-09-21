-- Phase 15: Catalogue CRUD audit actions
-- Additive-only enum extension (precedent: phase13/phase14b migrations).
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block; each
-- statement below is applied independently.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTRIBUTE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTRIBUTE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CATEGORY_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COLLECTION_ARCHIVED';
