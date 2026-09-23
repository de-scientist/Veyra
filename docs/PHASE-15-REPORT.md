# Phase 15 — Production Hardening, Deployment & Launch Preparation

## Executive Summary

Phase 15 transitioned the Phase I PASS release candidate toward a production
deployment candidate through hardening, decisions, and documentation — no
feature expansion, no redesign, no architecture replacement. One code fix
shipped (customer-detail authorization asymmetry, with a 10-test regression
suite); one formal business decision closed an open item (password
reset / email verification: FORMALLY DEFERRED); dependencies were audited
with a justified defer-major decision; and deployment/operations
documentation was corrected and extended.

Final status: **PARTIAL** — the codebase is a validated deployment candidate
(all gates green locally), but production launch remains blocked on external
infrastructure that does not exist in this environment (hosting, domain/TLS,
production database/backups, M-Pesa production credentials, monitoring,
staging). No code-level blocker remains. No production deployment was
performed; no real money was used; no secrets were committed.

Note on report placement: the repository root already contains a historical
`PHASE-15-REPORT.md` from an earlier workflow iteration. Per repository
policy that file is left untouched; this report is the Phase 15 record at
the required `docs/PHASE-15-REPORT.md` path.

## Phase I Carry-Forward Items

| # | Phase I item | Phase 15 disposition | Evidence |
|---|---|---|---|
| 1 | Live/sandbox M-Pesa callback validation (NOT VERIFIED) | Code + automated-test VERIFIED; live provider callback remains NOT VERIFIED — INFRASTRUCTURE LIMITATION (no sandbox credentials/network here). Sandbox E2E procedure documented; never real money. | `lib/payments/service.ts:100-179`, `provider.test.ts`, smoke fails-closed test |
| 2 | Browser QA (NOT VERIFIED) | NOT VERIFIED — INFRASTRUCTURE LIMITATION (no browser harness/staging URL). Static posture verified (server components, preset images, focus primitives). | Build route map; `useModalFocus` single primitive |
| 3 | Accessibility/AT QA (NOT VERIFIED) | Static checks VERIFIED (Phase I); screen-reader/keyboard walk-through NOT VERIFIED — INFRASTRUCTURE LIMITATION. No WCAG conformance claimed. | Phase I §11; `ACCESSIBILITY.md` |
| 4 | Device/responsive QA (NOT VERIFIED) | Static posture VERIFIED; pixel QA at 320–1920 NOT VERIFIED — INFRASTRUCTURE LIMITATION. | Build output; wrapper patterns |
| 5 | Staging performance measurements (NOT VERIFIED) | NOT MEASURED — INFRASTRUCTURE LIMITATION (no staging). Local build sizes recorded; no numbers invented. | Build: shared 87.1 kB |
| 6 | API latency measurements (NOT VERIFIED) | NOT MEASURED — INFRASTRUCTURE LIMITATION. Query posture reviewed (pagination, bounded analytics). | Code review; runbook slow-query notes |
| 7 | Dependency major-upgrade assessment | DONE: 17 vulns (5 moderate / 11 high / 1 critical), all requiring breaking majors (Next 16 / Prisma 7). Decision: DEFER majors; no `audit fix --force`. | `npm audit --omit=dev` output, this phase |
| 8 | Password-reset/email-verification decision | FORMALLY DEFERRED (was NOT IMPLEMENTED). Recorded in BUSINESS-DECISIONS.md with rationale, UX impact, alternative recovery, owner, target. | `BUSINESS-DECISIONS.md`; schema models untouched |
| 9 | `GET /admin/customers/:id` authorization asymmetry (Low) | FIXED + regression-tested (GET and PATCH both scoped). | `routes/admin.ts`, `admin-customers-authz.test.ts` (10 tests) |
| 10 | Production secrets/configuration | AUDITED: classification documented; `.env.example` duplicate fixed; no real secrets in repo; secret-absence asserted by tests. | `.env.example`; test secret-absence assertions |
| 11 | Hosting/deployment configuration | DOCUMENTED (no infra exists — UNKNOWN, honestly labelled). DEPLOYMENT.md migration order corrected (phase14–16 added). | `DEPLOYMENT.md`; `PRODUCTION-ENVIRONMENT.md` |
| 12 | Database backups/recovery | DOCUMENTED procedure (daily pg_dump, 30-day retention, quarterly isolated restore); no production DB exists so no restore drill could run — NOT VERIFIED live. | `OPERATIONS-RUNBOOK.md` |
| 13 | Monitoring/alerting | DOCUMENTED (what to alert, severity, response); none configured — UNKNOWN provider. Health/ready probes verified by tests. | Runbook; `routes/health.ts`; smoke + security tests |

## Baseline

Recorded before any modification (clean `git status` on `main`):

| Command | Result |
|---|---|
| `npm run typecheck` (api + web) | PASS |
| `npm run lint` | PASS — 0 errors; 1 pre-existing unused-var warning (api `storefront.ts`) + 4 pre-existing `<img>` warnings (web) |
| `npm test` | 28 files / 207 tests PASS |
| `npm run build` (api + web) | PASS — shared First Load JS 87.1 kB |
| `git status` | clean |
| `npm audit --omit=dev` | 17 vulns (5 moderate / 11 high / 1 critical), all `--force`-only |

No modifications were made until this baseline was recorded.

## Production Environment

`PRODUCTION-ENVIRONMENT.md` (root) remains the environment record: no
production infrastructure is provisioned and every external item is marked
`UNKNOWN — REQUIRES DEPLOYMENT/BUSINESS DECISION`. Verified this phase:

- Env classification: public (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`),
  server-only non-secret (`APP_URL`, `CORS_ORIGIN`, `RATE_LIMIT_*`,
  `BODY_LIMIT_BYTES`), secret (DB/session/M-Pesa/webhook credentials).
- Secrets are server-only by construction (grep-clean in web + bundles per
  Phase I; secret-absence asserted in user/customer/avatar tests). Only
  `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` may be public.
- Fixed `.env.example` duplicate `APP_URL` line (hygiene; no value change).
- `NODE_ENV=production` drives Secure cookies + JSON log transport.
- Environment separation documented: dev (localhost) / staging (isolated
  creds + isolated data, production-like) / production (real customer env;
  must never use dev/staging DB, sandbox M-Pesa, test webhooks, localhost
  URLs, or dev CORS origins).

## Staging Environment

No staging environment exists in this workspace (no hosting provider,
no staging URL, no isolated staging database). Documented as
`UNKNOWN — REQUIRES DEPLOYMENT DECISION` in `PRODUCTION-ENVIRONMENT.md`.
The staging validation procedure is defined (`DEPLOYMENT.md` deploy order +
smoke suites) so that once provisioned, staging can validate: frontend/API
deploy, connectivity, migrations, Cloudinary, auth/sessions/cookies, CORS,
HTTPS, M-Pesa sandbox, uploads, logging, monitoring, error handling.
Staging status: NOT VERIFIED — INFRASTRUCTURE LIMITATION. No staging
claim is made.

## Database & Migrations

- Prisma schema reviewed: identity, catalogue, cart/wishlist, checkout/order,
  payments, fulfillment/delivery, returns/refunds, notifications, media,
  admin/audit models intact; historical records immutable by convention.
- Migration history: 14 forward-only directories (`init` → `phase16`).
  Scanned all `migration.sql` files for `DROP TABLE/DATABASE`, `TRUNCATE`,
  and reset commands: **zero matches** — additive only (`IF NOT EXISTS`
  guards). No `prisma migrate reset` was run; no data deleted; no history
  rewritten.
- Corrected `DEPLOYMENT.md`: migration order previously ended at
  `phase13_analytics`; now includes `phase14_product_media`,
  `phase14b_product_media_audit`, `phase15_catalogue_crud`,
  `phase16_profile_avatar`. Approved apply method (`psql -v ON_ERROR_STOP=1`
  per file, in order) unchanged.
- Indexes/constraints/FKs: per Phase I audit, important query paths indexed;
  no schema change was needed or made in Phase 15.

## Backup & Recovery

Documented in `OPERATIONS-RUNBOOK.md` (unchanged — procedure was already
correct): daily `pg_dump` custom format, encrypted at rest, 30-day
retention, off-site copy, `pg_restore --list` verification plus quarterly
restore-into-isolated-DB smoke test; RPO/RTO `UNKNOWN — REQUIRES
BUSINESS/LEGAL REVIEW`. No production database exists, so no backup exists
and no restore drill could be performed: status NOT VERIFIED live, honestly
labelled. Migration rollout procedure (backup → verify candidate → apply →
verify schema → smoke → monitor → redeploy-rollback; DB restore only under
controlled recovery) is documented in `DEPLOYMENT.md` / runbook.

## M-Pesa Sandbox Validation

No live sandbox test was possible here (no Daraja credentials, no provider
network, no callback delivery mechanism) — and no real-money transaction
was attempted. What was verified instead, against source + automated tests:

1. Order creation is idempotency-keyed inside one transaction.
2. Initiation fails closed without credentials (smoke test asserts the
   customer journey reaches payment with safe error codes, never PAID).
3. Callback correlation is by provider-issued CheckoutRequestID
   (`service.ts:102`); unknown IDs are acknowledged-but-unprocessed.
4. Amount reconciliation: success callback with mismatched amount → FAILED +
   `RECONCILIATION_REQUIRED` (`service.ts:108-114`).
5. Duplicate PAID callback is idempotent (`service.ts:104`).
6. Inventory conversion runs transactionally with the payment update.
7. Failure paths (cancelled/timeout/rejected/malformed) map to FAILED with
   reasons, never to PAID.
8. Frontend cannot mark PAID (no such endpoint; asserted by tests).

Live sandbox E2E (order → STK push → provider callback → state transitions
→ duplicate/mismatch/cancel/timeout cases) is documented as a staging
activity requiring sandbox credentials and an HTTPS callback URL, with the
explicit rule: sandbox verified ≠ production credentials configured ≠
production callback verified. Status: code/test VERIFIED; live NOT VERIFIED.

## M-Pesa Production Configuration

Documented as placeholders only (`UNKNOWN — REQUIRES BUSINESS DECISION`):
shortcode, consumer key/secret, passkey, HTTPS callback/timeout/result URLs,
environment selection, credential ownership, secret-manager storage,
rotation. `.env.example` carries sandbox placeholders; production values
must arrive via secret manager and never enter Git, logs, errors, or docs.
`MPESA_ENVIRONMENT` must be `production` with sandbox disabled at launch.
HTTPS callback URLs are required (enforced by procedure, not yet verifiable
without infrastructure).

## Password Reset / Email Verification Decision

**FORMALLY DEFERRED** (Option B). Recorded in `BUSINESS-DECISIONS.md`:

- Why: token models exist but no endpoints consume them and no production
  email vendor (sender identity, SPF/DKIM/DMARC, rate-limited delivery) is
  configured. Shipping email-delivered single-use tokens over log/mock
  delivery would create account-takeover risk, not reduce it. No reset-token
  attack surface is deployed.
- UX impact: users who forget passwords must use support-assisted recovery
  until the flow ships.
- Security implications: none deployed (no token issuance, no enumeration
  surface beyond existing generic login errors + 10/min auth budget).
- Alternative: support-assisted reset via audited bootstrap process
  (least-privilege operator, temporary credential rotated immediately).
- Owner: business/product. Target: dedicated auth follow-up once the email
  vendor and sender-domain authentication are provisioned.
- Launch approval accepts this limitation. Authenticated password change
  continues to work. Status is FORMALLY DEFERRED, not NOT VERIFIED.

## Customer Authorization Remediation

**FIXED.** `GET /admin/customers/:id` (and the sibling `PATCH`, which shared
the flaw) performed `findUnique({ where: { id } })` with no role filter,
while the list endpoint filters `roles: { some: { role: { slug: 'customer' } } }`.
An operations user could therefore read (and, via PATCH name/phone fields,
edit) non-customer accounts — e.g. staff/admin users — including addresses,
order history, and return requests: PII beyond the directory's intended
scope. CUSTOMER-role callers were already fenced by `requireOperationsAccess`
(403), and ADMIN/SUPER_ADMIN boundaries were correct, so severity was Low,
but the asymmetry was real.

Fix (`apps/api/src/routes/admin.ts`): both endpoints now use
`findFirst({ where: { id, roles: { some: { role: { slug: 'customer' } } } } })`
and return `404 CUSTOMER_NOT_FOUND` for nonexistent, non-customer, and
malformed IDs alike (no 500, no enumeration oracle beyond the uniform 404).

Regression suite `apps/api/src/routes/admin-customers-authz.test.ts`
(10 tests, all passing): CUSTOMER→403, unauthenticated→401, staff/admin/
super_admin→200 on customer records, staff/admin lookups of staff/admin
IDs→404 (no PII), nonexistent→404 with code, malformed→404 (not 500),
PATCH of non-customer ID→404. `SECURITY.md` updated accordingly.

## Dependency Audit & Upgrades

`npm audit --omit=dev` this phase: 17 vulnerabilities (5 moderate / 11 high /
1 critical). Every remediation requires a breaking major (`--force`):
Next 16.x (SSRF/RCE/disclosure advisories + postcss chain) and Prisma 7.x
(valibot chain). Classification:

- Upgrade now: none (no non-breaking fix available).
- Safe minor/patch: none offered by the audit without `--force`.
- Defer major upgrade: Next 16, Prisma 7, Fastify 8-class advisories
  (Fastify 4.29.1 stream-DoS/content-type/X-Forwarded/coercion advisories
  remain mitigated in-app: `bodyLimit`, no `trustProxy`, object-only
  Zod-validated schemas).
- Requires dedicated migration project: Next major (App Router / caching /
  build behavior changes) and Prisma major (client/migration compatibility).
- Not applicable: `hono` chain is dev-only transitive tooling, never in the
  production runtime.

No upgrade was performed (`npm audit fix --force` explicitly NOT run) per
the stability-first rule. `LAUNCH-CHECKLIST.md` records the scheduled
advisory upgrade. Re-audit is required inside any future upgrade window
with full typecheck/lint/test/build + smoke revalidation.

## Security Configuration

Re-verified by code + existing suites (no weakening to make anything work):

- Auth/sessions: bcrypt-12, generic `INVALID_CREDENTIALS`, `veyra_session`
  HttpOnly/SameSite-Lax/Secure-in-production/7-day, server-side revocation,
  `assertUserActive` suspends/deletes centrally. Authenticated password
  change exists; no reset endpoints exist.
- RBAC: operations/financial/super-admin tiers enforced per request;
  customer fenced from all admin surfaces (403); role changes re-resolve per
  request (no stale privilege). Customer-detail scope fixed this phase.
- CORS: allow-list from `CORS_ORIGIN`, credentials without wildcard
  (evil-origin test asserts no ACAO). Helmet baseline headers asserted.
- Rate limits: global 100/min/IP; auth 10/min; sensitive (checkout/payment/
  refund/resend/media) 30/min; 1 MiB body cap. Login-flood → 429 covered.
- Errors: uniform `{ success, error: { code, message, details, requestId } }`;
  5xx never leaks internals; request IDs correlate logs.
- Uploads/Cloudinary: signed direct-upload only, server UUID IDs, server
  re-validation, no secret in frontend (grep-clean), HTTPS delivery, fixed
  presets. No upload behavior changed this phase.
- Health: `/health` cheap liveness; `/ready` SELECT-1 readiness (200/503,
  no driver leakage); neither exposes secrets or stack traces.
- Logging: pino JSON in production, `LOG_LEVEL` honored, request IDs;
  passwords/tokens/secrets/reset tokens never logged.

## Authentication & RBAC

Production smoke expectations defined (representative accounts once staging
exists): CUSTOMER shops/manages own account/avatar/cart/wishlist/orders and
is blocked from admin/catalogue/inventory/user/refund surfaces; STAFF
operates only authorized areas (cannot suspend/complete-refunds/manage
roles — tested); ADMIN administers within policy (financial completion
gated); SUPER_ADMIN performs system administration (self-lockout denied —
tested). Role changes take effect per request. Verified locally via
`rbac.test.ts` (20), `admin-users.test.ts` (4), `security.test.ts`, and the
new `admin-customers-authz.test.ts` (10). Post-deploy re-verification
against staging is still required (session/cookie domain behavior cannot be
proven locally).

## Cloudinary Production Validation

Code + test posture re-verified (no live production config exists):
signed uploads via `POST /media/sign-upload` (auth + policy + server UUIDs);
secret absent from web/bundles (asserted); finalize re-validates folder
prefix, self-namespace avatars (`403 AVATAR_NOT_OWNED`), image-only, HTTPS
host, allow-listed formats, dimensions, size caps; arbitrary public-ID
destruction blocked (prefix guards, no generic delete); replace =
persist-new-then-delete-old; delete = DB-first with `providerCleanup`
status. Staging must still exercise: upload/replace/delete, invalid type,
oversize, malformed metadata, unauthorized upload/delete, cross-user avatar
access, arbitrary public-ID attempt. Status: implementation VERIFIED;
production values NOT CONFIGURED.

## Browser QA

NOT VERIFIED — no browser harness or staging URL exists in this
environment, so no browser run was performed and none is claimed. Static
posture noted for the future pass: server components by default,
route-scoped client boundaries, preset-bounded lazy images, single
`useModalFocus` primitive for traps/Escape/restore, `JBConfirmDialog`
(never `window.confirm`), `JBIcon` (no emoji). Required staging pass:
Chrome/Edge (+Firefox where practical) across homepage, shop, search, PDP,
login, registration, account, profile/avatar, cart, checkout, order
confirmation, admin login/dashboard, product CRUD, product media, inventory,
orders, customers, notifications, theme switching — authenticated and
unauthenticated, expired sessions, unauthorized routes, mobile nav, dialogs,
drawers, focus traps, Escape, form/loading/empty/server-error states.

## Accessibility QA

Static checks VERIFIED (carried from Phase I: zero icon-only buttons without
names; traps/Escape/restore via one primitive; labelled controls;
alert/status messaging; table semantics; text+color badges; native details;
focus tokens; reduced-motion; meaningful alt text). Keyboard-only
(Tab/Shift+Tab/Enter/Space/Escape/arrows; visible focus; order; no traps;
dialog behavior; focus return) and screen-reader (headings, landmarks,
navigation, buttons, links, forms, validation errors, live regions, product
info, dialogs, cart controls) walk-throughs: NOT VERIFIED — no AT harness
available. No WCAG conformance claimed. Tooling + results must be recorded
during the staging pass.

## Responsive QA

NOT VERIFIED at pixels (no device/browser harness). Static posture:
`admin-table-wrapper` scroll, collapsing grids, drawer nav, sheets,
truncating headers reused consistently. Required staging matrix:
320/375/390/414/768/1024/1280/1440/1920 × Light/Dark/System — overflow,
header/nav, grids, filters, drawers, forms, tables, admin dashboard,
checkout, dialogs, galleries, buttons, typography, spacing, contrast, focus
indicators, disabled/error states.

## Performance Measurements

NOT MEASURED — INFRASTRUCTURE LIMITATION. No staging deployment exists, so
Lighthouse (LCP/CLS/INP/FCP/TTFB), JS/image payloads, route-level timings,
and API latency medians/tails were not collected and none are invented.
Recorded local facts: production build succeeds; shared First Load JS
87.1 kB (nominal, unchanged); lists paginated (admin ≤50, discovery ≤48);
dashboard uses 16 parallel indexed counts + 1 aggregate + 1 bounded scan
(no N+1 per audit); analytics bounded with 5,000-row CSV cap. No remediation
was attempted (rule: only fix measured problems). Staging must measure `/`,
`/shop`, PDP, search, login, account, cart, checkout, `/admin`, admin
products + login/product-list/product-detail/search/category/cart/checkout/
order-creation/admin-products/admin-orders/admin-customers/dashboard APIs.

## Monitoring & Alerting

No monitoring provider is configured (`UNKNOWN` — vendor undecided), so no
alert fires anywhere yet. The alert design is documented (runbook +
checklist): app uptime/5xx-rate/latency/deploy-failures; DB
availability/connections/pressure/slow-queries; M-Pesa initiation/callback/
mismatch/failure-rate anomalies; business ops (failed orders, stuck
payments, stale reservations, failed fulfillment); infra CPU/memory/disk/
capacity/deployment health — each with threshold, recipient, severity, and
response action to be bound at provisioning. Request-ID log correlation
(the substrate alerts will key on) is verified in test output. Status:
DESIGNED, NOT CONFIGURED.

## Deployment Procedure

`DEPLOYMENT.md` is the procedure (corrected this phase): prerequisites
(Node 20+, Postgres 14+, secret manager, domain/TLS, HTTPS callback URL) →
env from `.env.example` (`NODE_ENV=production`, exact origins, fresh
≥32-char secrets, real `DATABASE_URL`/M-Pesa/email) → forward-only `psql`
migrations in corrected order → pinned client generation → gates
(typecheck+lint+test+build) → backend → frontend → DNS → external callbacks
→ smoke tests (`smoke.test.ts` journey + `security.test.ts` contract/CORS/
headers/rate-limit/IDOR suites, self-cleaning) → monitoring. Rollback:
redeploy previous stateless artifact; additive migrations have no down path
— restore from pre-deploy backup to retreat schema; revert config/DNS;
re-run smoke after every rollback. No rollback was executed (nothing
deployed); the procedure is documented, not claimed as tested.

## Rollback Procedure

Application (frontend/API): redeploy previous artifact. Database:
forward-compatible additive migrations — no down-migration; schema retreat
means restore-from-backup under controlled recovery (never hand-edit enums).
Configuration: restore previous env/record set. Post-rollback: full smoke
suite + monitoring watch. Documented in `DEPLOYMENT.md` §Rollback and the
runbook; untested live (no deployment exists to roll back).

## SEO / Production URL Validation

Build output confirms `robots.txt` and `sitemap.xml` routes exist; admin and
account layouts carry `noindex` (per earlier phases); metadata base is
env-driven with a placeholder default that production must replace
(`NEXT_PUBLIC_APP_URL`). No staging/production URLs exist to crawl, so
canonical/sitemap/robots/metadata/OG/structured-data verification against a
live origin is NOT VERIFIED. Requirement recorded: no staging/dev URLs
indexed, no accidental site-wide `noindex`, private pages stay private.

## Legal / Business Readiness

No legal content invented. Classification (all `UNKNOWN — REQUIRES
BUSINESS/LEGAL REVIEW` unless noted): privacy policy, terms, returns/refund
policy, delivery policy, contact/business information, payment disclosures,
cookie/privacy notices — each present-but-unreviewed, missing, or deferred
per `LEGAL-READINESS.md` / `LAUNCH-CHECKLIST.md`. Company registration
details, prices, policies, and legal claims are not fabricated anywhere.

## Documentation

| Document | Phase 15 action |
|---|---|
| `docs/PHASE-15-REPORT.md` | CREATED (this file — required Phase 15 record) |
| `BUSINESS-DECISIONS.md` | UPDATED (formal password-reset/email-verification deferral) |
| `SECURITY.md` | UPDATED (customer-detail scope fix + regression pointer) |
| `LAUNCH-CHECKLIST.md` | UPDATED (Phase 15 resolutions marked; infra boxes honestly unchecked) |
| `DEPLOYMENT.md` | UPDATED (migration order corrected to phase16) |
| `.env.example` | FIXED (duplicate `APP_URL` removed) |
| `PRODUCTION-ENVIRONMENT.md` | REVIEWED — accurate as-is; no change required |
| `OPERATIONS-RUNBOOK.md` | REVIEWED — accurate as-is; no change required |
| Root `PHASE-15-REPORT.md` / `PHASE-15.5-REPORT.md` | Historical — left untouched per policy |

No real secrets appear in any document (placeholders only).

## Test Results

| Suite | Result |
|---|---|
| `npm run typecheck` (api + web) | PASS (before and after changes) |
| `npm run lint` | PASS — 0 errors; pre-existing warnings only (1 api unused-var, 4 web `<img>`) |
| `npm test` (full) | 29 files / 217 tests PASS (28/207 baseline + 1 new file / 10 new tests) |
| New `admin-customers-authz.test.ts` | 10/10 PASS |
| `npm run build` (api + web) | PASS — shared 87.1 kB |
| `npm audit --omit=dev` | 17 vulns, disposition documented, no action taken |
| Migration destructiveness scan | 0 DROP/TRUNCATE/reset matches across all 14 migrations |
| E2E/browser framework | NOT APPLICABLE (none in repo; inject-based suites are the substitute) |
| Staging smoke | NOT RUN — no staging exists |

Full-suite revalidation after the authz change: CONFIRMED — 29 files / 217
tests PASS with the change applied (existing customer read/edit positive
controls assert continued legitimate access; the narrowing strictly reduces
data returned).

## Remaining Risks

1. No hosting/domain/TLS/production-DB/monitoring exists — every
   environment-dependent claim is procedural, not proven live.
2. Live M-Pesa callbacks untested against the provider (sandbox or
   production); reconciliation discipline is code-reviewed only.
3. Browser/AT/device QA outstanding (static posture only).
4. Staging performance unmeasured (no numbers invented).
5. Dependency majors deferred (known advisories, mitigated in-app).
6. Legal/policy content unreviewed by the business.
7. Email/SMS vendors unselected (notification delivery is log/mock).
8. No CI pipeline (gates documented, not automated).

## Launch Blockers

BLOCKERS (all environmental, none code-level): production hosting, domain/
DNS/TLS, production database + verified backups, M-Pesa production
configuration + callback verification, email/SMS vendor decisions,
monitoring/alerting provisioning, staging E2E + browser/AT/device passes,
legal sign-off. The application itself has zero unresolved code-level
blockers.

## Final Phase 15 Status

```text
PARTIAL
```

Application readiness: PASS (typecheck/lint/tests/build green, 217 tests,
authz asymmetry fixed, decisions recorded, procedures documented).
Production readiness: BLOCKED on infrastructure that does not exist in this
environment. The repository is a documented, evidence-based deployment
candidate — not a declaration that the store may open. The next step is the
Phase 15.5 readiness gate after explicit approval, with real infrastructure
provisioned.
