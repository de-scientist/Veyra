-- Phase 10: Customer Account + Post-Purchase Experience
-- Safe, non-destructive migrations.

-- Add audit action enum values for account lifecycle events.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PROFILE_UPDATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ADDRESS_CREATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ADDRESS_UPDATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ADDRESS_DELETED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SESSION_REVOKED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'SESSIONS_REVOKED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ACCOUNT_DEACTIVATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETION_REQUESTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PREFERENCES_UPDATED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'GUEST_ORDER_CLAIMED';

-- Create user preference table for notification and communication preferences.
CREATE TABLE IF NOT EXISTS "UserPreference" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL UNIQUE,
    "emailOrderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "emailDelivery" BOOLEAN NOT NULL DEFAULT true,
    "emailReturns" BOOLEAN NOT NULL DEFAULT true,
    "emailMarketing" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "UserPreference_userId_idx" ON "UserPreference"("userId");

-- Add indexes for account query performance.
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Address_userId_idx" ON "Address"("userId");
