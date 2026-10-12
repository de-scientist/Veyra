-- Phase 18: Google sign-in (customer auth-code + PKCE flow).
-- Forward-only, additive, safe for existing users. Apply in order with psql:
--   psql -v ON_ERROR_STOP=1 -f prisma/migrations/20261012_phase18_google_auth/migration.sql
-- Never run `prisma migrate reset`; rollback = restore backup (no down path).

-- 1. External-only (Google) customer accounts have no password. Existing rows
-- keep their hashes; login treats NULL as invalid credentials.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- 2. Provider identities keyed by stable provider subject. One identity maps
-- to at most one user; deleting a user removes its links (history-preserving
-- order/payment rows are untouched — only the link row cascades).
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "providerSub"   TEXT NOT NULL,
  "email"         TEXT,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "linkedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerSub_key"
  ON "OAuthAccount"("provider", "providerSub");
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx"
  ON "OAuthAccount"("userId");

ALTER TABLE "OAuthAccount"
  ADD CONSTRAINT "OAuthAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Short-lived single-use OAuth transactions (state + PKCE + nonce +
-- operation binding). Consumed or expired rows are deleted by a cleanup pass.
CREATE TABLE IF NOT EXISTS "OAuthTransaction" (
  "id"           TEXT NOT NULL,
  "stateHash"    TEXT NOT NULL,
  "operation"    TEXT NOT NULL,
  "userId"       TEXT,
  "codeVerifier" TEXT NOT NULL,
  "nonce"        TEXT NOT NULL,
  "redirect"     TEXT NOT NULL DEFAULT '/account',
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "consumedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthTransaction_stateHash_key"
  ON "OAuthTransaction"("stateHash");
CREATE INDEX IF NOT EXISTS "OAuthTransaction_expiresAt_idx"
  ON "OAuthTransaction"("expiresAt");

ALTER TABLE "OAuthTransaction"
  ADD CONSTRAINT "OAuthTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Audit trail for link/unlink operations (existing audit mechanism).
-- NOTE: the enum type is the quoted mixed-case "AuditAction" (see init
-- migration); unquoted `audit_action` would fold to lowercase and fail.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GOOGLE_LINKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GOOGLE_UNLINKED';
