-- Phase 16: Profile avatar provider reference
-- Safe, non-destructive, additive-only migration. Nullable: existing rows
-- (unset or legacy-external avatars) keep working with avatarUrl alone.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarPublicId" TEXT;
