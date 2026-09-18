-- Phase 13: Analytics & Reporting
-- Safe, non-destructive, additive-only migration: export audit actions + analytics range index.
-- No transactional tables are created or altered; analytics reads authoritative domain data.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOMER_REPORT_EXPORTED';

CREATE INDEX IF NOT EXISTS "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");
