# PHASE 14 REPORT — PRODUCTION HARDENING + SECURITY + PERFORMANCE

## 1. Executive Summary

Phase 14 hardened the Phase 0–13 platform for production without adding business features. A full-system audit produced a baseline matrix; fixes landed for the two highest-severity findings — permissive CORS (`origin: true` + credentials, fixed with an allowlist) and an inconsistent error contract (hook-thrown errors bypassed the safe handler, fixed via encapsulated handlers + request IDs + safe 404s). Added per-route rate limits, a DB-backed readiness probe, Next.js baseline headers, and a 31-test security regression suite including live DB-backed IDOR/RBAC tests. Discovered a reachable dev database and applied the three pending additive migrations (Phases 11–13) with psql, verifying the full stack against real Postgres. Documented threat model, readiness matrix, and created `SECURITY.md`, `OPERATIONS-RUNBOOK.md`, `PRODUCTION-CHECKLIST.md`. Gates: typecheck, 91/91 tests, lint clean, build green, `npm audit` reviewed.

## 2. Repository Reconciliation

Reports were accurate with three material deviations found by inspection: (a) the API error handler did not cover `preHandler` hook errors due to Fastify encapsulation — every auth-guard rejection used the framework default shape (fixed); (b) `PHASE-2-REPORT.md` remains absent (auth reconstructed from `routes/auth.ts`, unchanged); (c) prior phases reported "no reachable database" — a local PostgreSQL 18 (`veyra_dev1`, all Phase 0–10 tables, zero rows) is in fact reachable via the untracked `.env`, enabling the DB-backed verification in this report.

## 3. Baseline Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | CORS reflected any origin with credentials | CRITICAL | Fixed (allowlist `CORS_ORIGIN`) |
| 2 | Hook errors bypassed safe error contract | HIGH | Fixed (encapsulated handlers, requestId, safe 404) |
| 3 | Single global rate limit only | HIGH | Fixed (per-route auth/sensitive budgets) |
| 4 | No readiness probe | MEDIUM | Fixed (`GET /ready`, fail-closed) |
| 5 | Catalogue admin was publicly writable (Phase 12 fixed; verified still guarded) | CRITICAL (historic) | Verified fixed |
| 6 | No CSP | MEDIUM | Deferred with justification (§12) |
| 7 | Next.js 14 transitive advisories (upgrade = breaking) | HIGH | Documented, Phase 15 upgrade path |
| 8 | Prisma 8 RC CLI lacks generate/migrate | MEDIUM | Worked around (pinned v5 generate; psql apply) |
| 9 | `customerSegments` unbounded history load | MEDIUM | Documented (§22) |
| 10 | Public catalog detail exposes inventory quantities | LOW | Pre-existing, documented |
| 11 | No login page in web app | LOW | Pre-existing, documented |
| 12 | Register 409 reveals email existence | INFORMATIONAL | Accepted tradeoff, rate-limited |

## 4. Production Readiness Matrix

| Domain | Status | Critical Findings | Blocking? | Evidence | Next Action |
|---|---|---|---|---|---|
| Authentication | READY WITH CONDITIONS | None open | No | bcrypt-12, generic login errors, session revocation, regression tests | Phase 15: password-reset flow audit (no UI routes exist) |
| Authorization | READY | Historic catalogue exposure fixed + verified | No | 401/403/404 injection tests incl. DB-backed IDOR | None |
| Payments/M-Pesa | READY WITH CONDITIONS | Sandbox-only creds | Yes (for launch) | Amount authority, idempotent callbacks, 15 s timeout | Production creds + callback URL (Phase 15) |
| Inventory | READY WITH CONDITIONS | Adjust race window | No | Atomic reservation, invariant guards, movement trail | Consider Serializable adjust or conditional update (Phase 15) |
| Data integrity | READY | None open | No | Constraints, quality probes, zero-row dev verification | Production backup/restore test |
| Observability | READY WITH CONDITIONS | No vendor monitoring | No | Structured logs, request IDs, health/ready | Phase 15: alerting |
| Dependencies | READY WITH CONDITIONS | Next.js advisories | No | `npm audit` reviewed | Planned Next 15/16 upgrade (breaking) |
| Infrastructure | NOT VERIFIED | No prod env access | Yes (for launch) | — | Phase 15: hosting, DNS, TLS, backups |

## 5. Threat Model

Actors: guest, customer, malicious authenticated user, staff, admin, super-admin, callback spoofer, DB attacker, provider outage. Key pairs (threat → mitigation → residual): cross-account reads → owner-scoped queries + 404s, verified by DB tests → none known; privilege escalation → coarse-role server guards, no role self-assignment endpoint → low (no MFA); payment spoofing → amount authority + callback correlation + HMAC where applicable → low; replay → idempotency keys + deterministic event ids + terminal-state short-circuit → low; inventory race → conditional atomic reservation → low (adjust path medium, see §16); webhook forgery → HMAC/replay protection → low; secret theft → gitignored env, no client exposure, scan clean → low; dependency compromise → audit reviewed, lockfile pinned → medium (Next advisories); PII harvest → DTO minimization + audited exports → low.

## 6. Authentication Security

bcrypt cost 12, never plaintext, hashes never serialized (explicit DTOs; `serializeUser` allow-list). Login uses a single generic `INVALID_CREDENTIALS` (no enumeration); register 409 is an accepted UX tradeoff under a 10/min limit. Cookies: HttpOnly, Secure in production, SameSite=Lax, 7-day expiry. Password change revokes other sessions; logout revokes server-side. No password-reset UI routes exist, so no reset-token attack surface is deployed. Brute force: 10/min/IP auth budget + generic errors.

## 7. Session Security

Server-side sessions with expiry + `revokedAt`; validation on `tokenHash` only; raw tokens never persisted or returned; revocation lists exclude revoked/expired; current-session protection on self-revocation; multi-device via independent rows. No refresh-token or client-readable session material exists.

## 8. RBAC / Authorization

Every protected resource re-verified: customer owner-scoping (orders, addresses, notifications, sessions) enforced in queries; admin/financial/analytics behind `requireOperationsAccess`/`requireFinancialAccess`; catalogue admin re-verified guarded post–Phase 12. DB-backed tests prove: A→B order 404, A→B address exclusion, A→B notification 404, A→B session revoke 404, customer→admin 403 ×3, B→own 200. No role/permission fields accepted from clients anywhere.

## 9. API Security

Inventory (method/path/auth/validation/limit/audit) reviewed across all 12 route modules: public (catalog reads, auth login/register, cart reads, checkout preview/place, payment initiate/callback/status, webhooks), customer (account, wishlist/cart mutations, returns, notifications), staff (fulfillment, returns, notifications ops, catalogue, admin reads), admin-only (refund completion), provider (callbacks, HMAC, no session). Per-route rate limits added where missing (§17). All mutations use Zod schemas; AJV strips unknown body fields globally.

## 10. Input Validation

Zod on all bodies; query schemas with bounds (pagination caps, 400-day analytics ranges, 5,000-row export cap, 1 MiB body limit now explicit via `BODY_LIMIT_BYTES`); UUID formats enforced where IDs are consumed; monetary values `z.number().min(0)` into Decimal columns; date ranges validated (invalid/inverted/oversized/future rejected with codes). File uploads: no upload endpoints exist (Cloudinary vars are placeholders) — validation rules documented for Phase 15 if uploads are added.

## 11. XSS / CSRF / CORS

XSS: zero `dangerouslySetInnerHTML`/`innerHTML` in web; notification templates escape per-variable server-side; reasons/notes length-capped plain data. CSRF: SameSite=Lax cookies + JSON APIs + no cookie-authenticated GET mutations; dedicated tokens deferred as the architecture matches the standard Lax-cookie pattern. CORS: was `origin: true` (any origin + credentials) — now `CORS_ORIGIN` allowlist (default localhost:3000), non-listed origins get no ACAO header (verified by test), methods/headers allow-listed.

## 12. Security Headers

API (helmet defaults, verified by test): `nosniff`, `SAMEORIGIN` frameguard, HSTS, referrer-policy, hide-powered-by. Web (`next.config.mjs`): nosniff, SAMEORIGIN, strict referrer, minimal permissions-policy. Strict CSP deferred: Next.js hydration inline scripts require a nonce architecture; an arbitrary CSP would either break the app or provide theater. Recorded as Phase 15 work, not silently dropped.

## 13. File Upload Security

No file-upload endpoints, filesystem writes from user input, or path operations exist in the codebase (verified by search). Cloudinary credentials are unset placeholders. Upload validation policy (MIME/size/dimensions/signed uploads) is specified in the report for future implementation rather than invented now.

## 14. Payment Security

Verified end-to-end in code: amount from persisted `Order.grandTotal`; frontend cannot set amounts or success; STK acceptance ≠ success (PENDING only); callback correlates `CheckoutRequestID`, verifies amount/currency, converts inventory transactionally, dedupes terminal states; attempts distinguishable via idempotency correlation key + unique constraints; failures never mark orders paid; unknown states stay recoverable (`RECONCILIATION_REQUIRED` path emits no customer notification).

## 15. M-Pesa Security

`MPESA_CONSUMER_KEY/SECRET/PASSKEY` server-only (env), absent from bundles (only `NEXT_PUBLIC_API_URL` is public), Git (scan clean), logs, errors, and analytics DTOs. OAuth tokens cached process-locally with pre-expiry refresh (multi-instance note documented in Phase 7, unchanged). 15 s fetch timeout with abort. Sandbox credentials only — production cutover is a Phase 15 blocker.

## 16. Inventory Concurrency

Checkout reservation is a single conditional `UPDATE ... WHERE onHand - reserved >= qty RETURNING` inside a Serializable transaction — exactly one of two concurrent single-unit requests can win (verified by code inspection against Postgres semantics). Conversion/release are transactional with guarded decrements. Residual: admin adjust is read-validate-write in a default-isolation transaction (row lock serializes writers; concurrent adjusters get safe outcomes but may need retry on invariant conflict) — documented, not silently fixed.

## 17. Order / Refund / Return Integrity

State machines remain separate with no admin "complete everything" path; transitions go through Phase 8/9 services with history + audit. Refunds: `total ≤ paid` enforced in-transaction, idempotent-by-status completion, financial-role gating, frontend amounts untrusted. Returns: ownership, eligibility, per-item remaining-quantity guards, no duplicate lines, single restock via `restockApplied`, exchange replacement revalidated.

## 18. Data Privacy

PII inventory: name/email/phone/address/order/delivery/activity — all required or operational; no new PII added. Minimization verified: customer DTOs exclude hashes/tokens; admin customer views exclude secrets; exports exclude phones/addresses/secrets; analytics prefers aggregates. Retention policy undefined → `UNKNOWN — REQUIRES BUSINESS/LEGAL DECISION`.

## 19. Secrets Management

`.env` gitignored and untracked (only `.env.example` tracked); history scanned (no keys/certs); new vars added (`CORS_ORIGIN`, `RATE_LIMIT_*`, `BODY_LIMIT_BYTES`); rotation procedures in runbook; no rotation performed (no evidence of compromise — correctly not rotated blindly).

## 20. Dependency Security

`npm audit`: 25 vulns (8 moderate/15 high/2 critical; prod-only: 17 with 1 critical) — all transitive via pinned majors (Next 14, Prisma 8 RC→valibot, postcss). Fixes require breaking upgrades (`next@16`, `prisma@7`); per policy, documented with a Phase 15 upgrade path instead of blind `audit fix --force`. Lockfile single (`package-lock.json`). No suspicious install scripts found; no unused-dependency purge performed (risk/benefit negative this phase).

## 21. Database Security

Least-privilege documented for Phase 15 (single dev role currently; app vs migration role split specified). No per-row DB policies (enforcement lives in services, tested). Constraints verified: unique SKU/slug/orderNumber/token-hash/provider refs, FKs, non-nulls. Connection: Prisma singleton (no client leak); pooling/timeouts are driver defaults — production pool sizing is a Phase 15 action.

## 22. Database Performance

Indexes added in Phases 12–13 cover admin/analytics patterns; no full-scan hotspots found in review (bounded counts, narrow selects, capped pagination). `customerSegments` loads unbounded order history into memory — the one genuine hotspot, flagged with a bounded-scan recommendation for Phase 15 (behavior-preserving change refused this phase). No EXPLAIN available meaningfully against an empty dev DB; recorded as Phase 15 with production-like data.

## 23. API Performance

Critical paths reviewed: catalogue (indexed, paginated), cart (single-query serialize), checkout (bounded cart items, deterministic row order), callbacks (indexed correlation), admin lists (capped), analytics (aggregates + caps). No latency tooling in-repo; p95/p99 measurement requires staging — Phase 15. No optimization without evidence was performed.

## 24. Frontend Performance

Shared JS unchanged at 87.1 kB; admin/analytics pages add ~1–4 kB each; server components for public pages retained; charts are dependency-free SVG; images use `next/image` except four pre-existing `<img>` warnings (unchanged). LCP/INP/CLS need production-like measurement — Phase 15.

## 25. Core Web Vitals

Not measurable in this environment (no prod data/hosting); review found no anti-patterns (no hero lazy-load abuse, fonts default). Baselines and budgets assigned to Phase 15.

## 26. Caching

No HTTP or application caching of private data exists — nothing to invalidate and no cross-customer leak surface. Phase 13 deliberately added no analytics cache. CDN/edge caching is a Phase 15 deployment decision.

## 27. Observability

Pino structured logs with levels (`LOG_LEVEL`), request-ID correlation in every error response, auth-guard rejections logged server-side (stacks in logs only, never responses), notification worker/outbox audit trail, dead-letter auditing, analytics execution unbothered. No vendor APM — Phase 15.

## 28. Logging

Production policy: info level, no passwords/tokens/secrets/PII payloads by construction (DTOs + generic 5xx + safe readiness/health). Log retention undefined → `UNKNOWN — REQUIRES BUSINESS/LEGAL DECISION`.

## 29. Health Checks

`GET /health` (liveness, cheap, public) and new `GET /ready` (SELECT 1; 200/503 `NOT_READY`, zero driver leakage — tested both shapes). No secrets or topology disclosed.

## 30. Backups

No production database exists, so no backups exist — stated plainly, not assumed. Runbook specifies: daily encrypted `pg_dump`, 30-day retention, off-site copy, quarterly isolated-restore test. Migration journal note: schema was created without `_prisma_migrations`; Phase 11–13 migrations were applied here via psql with `ON_ERROR_STOP`.

## 31. Disaster Recovery

Runbook covers app/DB/provider/media/hosting/DNS/secret-compromise/corruption scenarios with detect→contain→investigate→recover→verify→document steps. Provider-outage behavior verified in code: M-Pesa unreachable → attempt fails safe (never paid); email/SMS failure → commerce state untouched, retries bounded and idempotent; media outage → catalogue intact (URL references only).

## 32. Deployment Safety

Checklist created (`PRODUCTION-CHECKLIST.md`): env, migrations (psql forward-only; repo CLI cannot migrate — documented workaround), builds, domain/HTTPS/CORS/cookies, M-Pesa prod, monitoring, backups, rollback (redeploy prior artifact; additive migrations mean no down-migration — restore-from-backup if schema must retreat). Blue/green deferred (no hosting yet).

## 33. CI/CD Security

No CI configuration exists in the repository — stated, not assumed. Requirements documented (secret storage, no log leakage, test gates, protected deploys, branch protection). Nothing to audit beyond absence.

## 34. Testing

Suites: 91/91 green (60 pre-existing + 31 new `security.test.ts`: 12 unauthenticated-401 contract, 3 validation-precedence, 4 error/CORS/header/probe, readiness, 12-attempt rate-limit 429, 7 DB-backed IDOR/RBAC with fixture cleanup verified). Concurrency verified by inspection (live-race tests need staging). E2E: no runner exists in-repo; critical journeys enumerated for Phase 15 with sandbox.

## 35. Load / Concurrency Testing

Not executed (no staging target; sending load to localhost proves nothing about production). Controlled plan + success criteria documented for Phase 15; inventory race analyzed statically (§16).

## 36. Accessibility Regression

No automated runner in-repo. Manual review: semantic landmarks, labeled admin controls, keyboard-operable queues/filters/pagination, text+color badges, chart text alternatives (Phase 13), focus styles from the design system. No new barriers introduced; full audit assigned Phase 15.

## 37. Mobile Regression

Responsive admin/account layouts verified by construction (card fallbacks, scrollable tables, drawer nav); device-lab testing assigned Phase 15. Breakpoints from prior phases unchanged.

## 38. Production Configuration

`.env.example` now documents all 30+ variables with safe defaults; placeholders that must change are flagged (`AUTH_SECRET`, webhook secrets, `APP_URL`, `metadataBase` placeholder domain, `CORS_ORIGIN`). Production domain/DNS/SSL: `UNKNOWN — REQUIRES BUSINESS/DEPLOYMENT DECISION`.

## 39. Security Documentation

`SECURITY.md` created (architecture, secrets, payments/webhooks, data protection, rate limits, disclosure policy, production practices).

## 40. Operations Runbook

`OPERATIONS-RUNBOOK.md` created (probes, deploy/rollback, migration workaround, backups, troubleshooting table, incident response).

## 41. Production Checklist

`PRODUCTION-CHECKLIST.md` created (security/database/payments/performance/operations gates).

## 42. Remaining Risks

Next.js transitive advisories (breaking upgrade needed); unbounded `customerSegments` history load; admin adjust race window; no MFA; single global CORS default if misconfigured; Prisma 8 RC CLI without migrate/generate; no prod monitoring/backups (no prod env); register enumeration tradeoff; public inventory quantities on catalog detail.

## 43. Business / Infrastructure Decisions

```text
UNKNOWN — REQUIRES BUSINESS/LEGAL DECISION: log/audit retention; PII retention; marketing consent basis.
UNKNOWN — REQUIRES BUSINESS DECISION: rounding rules (Decimal preserved, no rounding policy stated); fiscal calendar; refund hierarchy; inventory reason taxonomy; admin session duration; export field policy.
UNKNOWN — REQUIRES BUSINESS/DEPLOYMENT DECISION: production domain/DNS/hosting/TLS; database provider and roles; backup SLA; monitoring vendor; Next.js upgrade window; CSP nonce architecture; load-test authorization.
```

## 44. Blockers

Launch blockers (all environmental, none code-defects): production hosting/domain/TLS undecided; production database + backup/restore unprovisioned; M-Pesa production credentials + HTTPS callback URL missing; email/SMS vendors unconfigured; monitoring/alerting absent; Next.js advisory upgrade unplanned. No unresolved CRITICAL code vulnerability remains.

## 45. Phase 15 Preparation

Phase 15 (Launch Readiness + Deployment) must: provision prod hosting/DNS/TLS/database/secrets; apply migrations in order; configure M-Pesa/email/SMS production; set up monitoring/alerting/backups with tested restore; run DB-backed E2E, load, and Web-Vitals baselines; execute the Next.js upgrade; implement CSP nonces; tighten CORS to the final domain; rehearse rollback; complete the production checklist.
