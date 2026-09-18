# Veyra Security Policy

## Architecture

- Cookie-session auth (`veyra_session`, HttpOnly, Secure in production, SameSite=Lax, 7-day expiry, server-side revocation). Passwords: bcrypt (cost 12). No JWTs, no client-side tokens.
- Coarse-role RBAC: `customer`, `staff`, `admin`, `super_admin`. Operations routes require staff+; financial completion requires admin+. All authorization is server-side; UI gates are UX-only.
- Money: PostgreSQL `NUMERIC(10,2)` via Prisma Decimal. No float arithmetic on financial paths.
- Errors: uniform `{ success: false, error: { code, message, details, requestId } }`; 5xx never leaks internals; request IDs correlate logs.

## Secrets

Server-only via environment (see `.env.example`). Never in Git (`.env` gitignored; only `.env.example` tracked), logs, error responses, analytics, or `NEXT_PUBLIC_*` (only the public API base URL is exposed). M-Pesa credentials live server-side with a 15 s provider timeout. Webhook secrets verified with timing-safe HMAC.

## Payments & Webhooks

- Amounts come from persisted orders; the frontend never determines payment success.
- M-Pesa callbacks are correlated by checkout request ID, amount-verified, idempotent (duplicate callbacks harmless), and transactional with inventory conversion.
- Notification delivery callbacks are HMAC-verified with replay protection.

## Data Protection

- Explicit DTOs everywhere; no raw entity serialization. Password hashes, session tokens, provider secrets, and raw callback payloads never leave the API.
- Customer data is owner-scoped; guest orders require confirmation tokens; admin PII views are role-gated and audited.
- Sensitive mutations (inventory, refunds, role-adjacent changes, exports) write append-only `AuditLog` rows with actor, IP, and user-agent.

## Rate Limiting

Global 100 req/min/IP plus stricter budgets: auth endpoints (login/register/password/lifecycle/exports, 10/min), checkout/payment/refund/resend (30/min). See `apps/api/src/lib/rateLimits.ts` and PHASE-14-REPORT for the matrix.

## Reporting Vulnerabilities

Report security issues privately to the platform maintainers with: affected endpoint/version, reproduction steps, and impact. Do not open public issues for active vulnerabilities. Rotate any exposed credential immediately; assume Git history is permanent.

## Production Practices

HTTPS only, allowlisted `CORS_ORIGIN`, secure cookies, security headers (helmet + Next header subset; strict CSP deferred — see PHASE-14-REPORT §12), dependency audits before release, migrations applied forward-only, backups with tested restores, and the smoke suite from OPERATIONS-RUNBOOK before every deploy.
