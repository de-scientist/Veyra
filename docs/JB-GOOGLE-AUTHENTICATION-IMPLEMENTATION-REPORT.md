# JB Google Authentication — Implementation Report

Status: **IMPLEMENTED** (automated verification green; live-Google browser flow UNVERIFIED — no OAuth test client available).
Date: 2026-10-12. Owner-facing setup in §8; remaining manual steps in §12.

## 1. Audit Findings (verified against the repo, not assumed)

- **Frontend** (`apps/web`, Next.js 14.2.15 / React 18.3.1, App Router): `LoginForm`/`RegisterForm` in `components/AuthForms.tsx` (zod + `auth-validation.ts`, `safeRedirectTarget`, `AuthAlert`, `JBButtonLoader`, toast via `Toast.tsx`); session via `lib/session.tsx` (`/auth/me` + `jb:session-updated` event, navbar sync in `Header.tsx`); API base `NEXT_PUBLIC_API_URL` with `credentials: 'include'`; no CSRF token (relies on SameSite cookie); no `/logout` page (menu-driven `POST /auth/logout`); no settings page — account area is `app/account/*` with `security/page.tsx` (password + sessions + deactivate/delete); no OAuth/OIDC code or deps anywhere.
- **Backend** (`apps/api`, Fastify ^4.25.0, Node 24.21.0): `POST /auth/register|/login|/logout`, `GET /auth/me` (`src/routes/auth.ts`); sessions are `crypto.randomUUID()` rows (sha256 peppered hash), cookie `veyra_session` (HttpOnly, SameSite Lax, Secure in prod, 7d, no renewal); `assertUserActive` gates every auth path; roles via `Role/UserRole` + `requireAuth/requireRole/requireOperationsAccess/requireFinancialAccess/requireSuperAdmin/requirePermission`; bcrypt cost 12; envelope errors `{success, error:{code,message,details,requestId}}`; global + `authLimit` (10/window) rate limits; no CSRF tokens; only "oauth" string in repo is M-Pesa Daraja.
- **Database**: `User.email` unique (app-layer `toLowerCase`, no DB citext); `User.passwordHash` was `NOT NULL`; `UserStatus` ACTIVE/INACTIVE/SUSPENDED/DELETED; no provider/external-identity model; migration discipline is forward-only additive SQL applied with `psql` (never `migrate reset`); audit enum type is the quoted `"AuditAction"` (the phase-10 file's unquoted `audit_action` would fold and fail — used the correct name).
- **Tests/config**: vitest (`apps/api/src/**/*.test.ts`, `apps/web/lib/**/*.test.ts`), `buildApp()+app.inject` self-cleaning fixtures, no E2E tooling (no Playwright/Cypress); env validated in `apps/api/src/lib/env.ts`; `APP_URL` doubles as the web canonical URL (no separate `WEB_APP_URL`/`API_BASE_URL` — not duplicated); gate `typecheck && lint && test && build`.

## 2. Gap Matrix

| Area | What exists | Verified gap | Required action | Disposition |
|---|---|---|---|---|
| Login/signup UI | `AuthForms.tsx` login/register, validation, redirects, toasts | No Google entry point | Add button + status/error handling, keep forms | IMPROVE |
| OAuth integration | None (M-Pesa OAuth only) | No OIDC client, no flow | Add `google-auth-library@11.2.0` + server flow | CREATE |
| User/provider schema | `User` (password required), `Session`, roles | No provider model; `NOT NULL` hash blocks external-only accounts | Nullable hash + `OAuthAccount` + `OAuthTransaction` | IMPROVE |
| Session handling | `veyra_session` HttpOnly/Lax/7d, manual parse, no renewal | None for this task | Reuse `createSession`/cookie helpers verbatim | KEEP |
| Account linking | Password-change reauth, session revoke, deactivate/delete | No linking flow or UI | Backend binding + minimal Security-page UI | CREATE |
| Security/tests | Rate limits, zod, envelope errors, inject fixtures | Transaction security + coverage for new flows | Single-use state/PKCE/nonce, 14 API + 6 web tests | IMPROVE |

Nothing existing was rewritten: helpers are reused by export, not duplication.

## 3. Reused Components and Services

Backend: `createSession`, `getCookieOptions`, `serializeUser`, `parseSessionTokenFromRequest` (now exported from `routes/auth.ts`), `assertUserActive`, `requireAuth`, `hashToken`/`verifyPassword`/`hashPassword`, `authLimit`, `HttpError` envelope, `customer`-role upsert pattern, `auditLog` writes. Frontend: `safeRedirectTarget`, `AuthAlert`, `JBButtonLoader`, `useSession`/`notifySessionUpdated`, `useConfirm`/`JBConfirmDialog`, `useToast`, theme tokens (`globals.css`), no new notification/state libraries.

## 4. New / Modified Endpoints (`apps/api/src/routes/google-auth.ts`)

| Endpoint | Auth | Responsibility |
|---|---|---|
| `GET /auth/google/status` | public | `{configured}` only (no secrets) — UI hides the button when false |
| `GET /auth/google/start?redirect=` | public, `authLimit` | Creates `SIGN_IN` transaction, 302 to Google; config failure redirects with `google_error=not_configured` |
| `GET /auth/google/callback?code&state` | public, `authLimit` | Consumes tx single-use, PKCE exchange, ID-token verification, session + frontend redirect |
| `GET /auth/google/link/status` | `requireAuth` | `{linked, email, hasPassword}` for settings UI |
| `POST /auth/google/link/start` `{currentPassword?, redirect?}` | `requireAuth`, `authLimit` | Reauth (password accounts), creates `LINK` tx bound to `userId`, returns `{url}` |
| `POST /auth/google/unlink` `{currentPassword}` | `requireAuth`, `authLimit` | Reauth, lockout refusal, deletes link, audits |

Modified: `routes/auth.ts` (4 helper exports; login treats NULL hash as invalid credentials), `lib/account/account.ts` (`NO_PASSWORD_SET` guard), `lib/env.ts` (3 optional vars), `app.ts` (route registration).

## 5. OAuth Flow and Security Controls

Authorization-code + PKCE (S256) + `nonce`, backend callback, existing cookie session. Scopes `openid email profile` only. Per initiation: 32-byte `state` (stored as peppered hash), 32-byte verifier, 16-byte nonce, 10-min TTL, operation binding (`SIGN_IN`|`LINK` + `userId` for link). Callback: provider errors → safe redirect; `updateMany(consumedAt=null, unexpired)` single-use consume; `OAuth2Client.getToken({code, codeVerifier})`; `verifyIdToken({idToken, audience})` (signature/iss/aud/exp) plus manual `iss` allowlist, `nonce` equality, non-empty `sub`, email present, `email_verified === true` (else `GOOGLE_EMAIL_UNVERIFIED`, no account). Exact `redirect_uri` (prod requires explicit `GOOGLE_REDIRECT_URI`, fail-closed). Redirect targets restricted to same-origin paths (`safeRedirectPath`, mirrors web rule). Rate limits on start/callback/link/unlink; zod bodies; no code/token/secret/session logging (only error codes); opportunistic stale-transaction cleanup. Unverified tokens, frontend roles/IDs, and email-equality are never trusted.

## 6. Account-Creation and Linking Rules

- Identity key = Google stable `sub` (`OAuthAccount @@unique([provider, providerSub])`); email is a normalized attribute.
- New Google users: `passwordHash NULL` (no placeholders), names from verified claims, `emailVerifiedAt=now`, `customer` role upsert only (missing seed role tolerated per existing convention), account+link created in one Prisma transaction, audited (`GOOGLE_LINKED`), session minted after success. P2002 races re-resolve through the identity instead of double-creating.
- Email match on unlinked account → `google_error=email_exists`, no session, no row, no merge; message directs to password sign-in + Security linking.
- Linked `sub` → status check (`account_inactive` redirect for non-active) → session. Never reassigned on email change.
- Linking: authenticated session + explicit action + `LINK` tx bound to that `userId` (callback re-verifies the live session matches; frontend IDs ignored) + current-password reauth when a hash exists + identity-taken rejection (`identity_taken`) + `GOOGLE_LINKED` audit; existing session preserved (no swaps).
- Unlink: requires link + password reauth; refused with `GOOGLE_UNLINK_LOCKOUT` when no password would remain; audited (`GOOGLE_UNLINKED`).

## 7. Database Changes and Migration

`prisma/migrations/20261012_phase18_google_auth/migration.sql` (forward-only, `IF NOT EXISTS` guards; applied statement-by-statement — `psql` CLI was unavailable on this machine, so the file was executed via Prisma `$executeRaw`, equivalent to `psql -v ON_ERROR_STOP=1 -f`): `User.passwordHash` → nullable (existing hashes untouched); new `OAuthAccount` / `OAuthTransaction` tables with unique + FK constraints; `"AuditAction"` += `GOOGLE_LINKED`, `GOOGLE_UNLINKED`. Prisma client regenerated with classic `prisma@5.22.0 generate` (repo root ships Prisma 8 RC CLI, which cannot generate the 5.x client). No resets, no deletions. To apply on another environment: `psql -v ON_ERROR_STOP=1 -f prisma/migrations/20261012_phase18_google_auth/migration.sql`, then `npx -y prisma@5.22.0 generate --schema=prisma/schema.prisma`.

## 8. Environment Variables and Google Cloud Configuration

Reuse `APP_URL` (frontend return base) and `CORS_ORIGIN`; added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (backend-only, never `NEXT_PUBLIC_`), optional `GOOGLE_REDIRECT_URI` (see `.env.example`). Absent credentials fail closed; `GET /auth/google/status` lets the UI hide the button.

Owner setup (Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application):

1. Consent screen: External (or Internal for Workspace-only testing), app name **JB Mercantile**, support email, scopes `openid email profile` (no other scopes), add test users while in Testing mode; publish when ready for production.
2. Authorized JavaScript origins: exact web origin(s), e.g. local `http://localhost:3000` and the production storefront origin (must match `CORS_ORIGIN`/`APP_URL`).
3. Authorized redirect URIs: the exact API callback — local `http://localhost:3001/api/v1/auth/google/callback`; production `https://<your-api-host>/api/v1/auth/google/callback` (must equal `GOOGLE_REDIRECT_URI` character-for-character; Google rejects mismatches).
4. Copy Client ID/Secret into backend `.env` (never frontend, never git). Restart API. Verify `GET /api/v1/auth/google/status` → `{"configured":true}` and that login/register show "Continue with Google".

## 9. Local and Production Callback Setup

- Local: leave `GOOGLE_REDIRECT_URI` unset (dev default `http://localhost:3001/api/v1/auth/google/callback`); register that exact URI in Google Cloud; `APP_URL=http://localhost:3000`, `CORS_ORIGIN=http://localhost:3000`.
- Production: set `GOOGLE_REDIRECT_URI` to the exact registered `https` callback; cookie is `Secure`, `SameSite=Lax` (top-level navigation callback sends it); cross-origin API/web requires `CORS_ORIGIN` = web origin and `credentials: 'include'` (already the case). SameSite=Lax top-level GET is sufficient — no third-party-cookie dependency.

## 10. Tests and Commands Executed (actual results)

- `npm run typecheck` (api + web): PASS.
- `npm run lint` (api + web): PASS — only pre-existing warnings (`storefront.ts` unused var; Next `no-img-element`).
- New: `apps/api/src/routes/google-auth.test.ts` — 14/14 PASS (mocked provider via test-only hooks; documented per-test IP rotation for rate limits, one shared bcrypt fixture, stamp-scoped cleanup).
- New: `apps/web/lib/google-auth.test.ts` — 6/6 PASS (callback-message mapping, initiation URL).
- Full `npm test`: **66/66 files green** (638 tests) with `npx vitest run --testTimeout=30000`. Note: with the default 5s timeout, parallel load on this machine intermittently times out slow suites (`lib/auth.test.ts` bcrypt, `commerce`/`fulfillment` DB contention) — verified passing in isolation and in a 64/64 baseline run excluding the new files; the flakes are pre-existing load sensitivity, not regressions (failing files vary run to run; nothing I touched).
- `npm run build` (api `tsc`, web `next build`): PASS.

## 11. Browser / E2E Verification Status

**NOT VERIFIED with live Google** — no OAuth client credentials, no test users, and no E2E tooling exist in this environment (honest per policy; mocked tests do not substitute). Manual checklist for the owner (§8 configured): local login, new registration, repeat login, password-account email clash (`email_exists` guidance), authenticated link from Security, cancellation (`cancelled`), session + logout, production-domain callback.

## 12. Deployment Considerations and Known Limitations

- Apply migration before deploy (§7); set `GOOGLE_REDIRECT_URI` + secret in prod env; confirm Google Cloud URIs match exactly.
- Google-only accounts cannot set a password yet (`NO_PASSWORD_SET` on change/unlink-without-password) — needs a dedicated set-password flow (future).
- No session-age tracking exists, so link reauth uses current-password confirmation (existing convention) rather than a time-based step-up.
- Sessions have no sliding renewal (pre-existing); Google sessions inherit the 7-day absolute lifetime.
- `ADD CONSTRAINT` lines in the migration are single-apply (Postgres has no `IF NOT EXISTS` for constraints) — re-running needs the tables dropped first; forward-only discipline applies.
- Test-only seams `__setGoogleTestConfig` / `__setGoogleExchangeHook` throw outside `NODE_ENV=test`.

## Definition of Done (evidence)

Audited before coding (§1) ✓; Google entry on login/register (hidden when unconfigured) ✓; Google registration is customer-only (test: roles `== ['customer']`) ✓; no silent merges (test: `email_exists`, zero link rows) ✓; linking needs session + bound tx + password reauth (tests: 401 anon/wrong, `link_failed`, `identity_taken`) ✓; identity keyed by `sub` ✓; state/PKCE/nonce/claims validated (tests incl. claim unit cases) ✓; cookie session reused, password flows intact (tests + full suite) ✓; no staff/admin via Google ✓; status/logout/cookie security enforced (tests: `account_inactive`, no session on errors) ✓; loading/success/cancel/error UI states ✓; typecheck/lint/test/build executed (§10) ✓; docs written; E2E honestly reported (§11) ✓; no unrelated rewrites ✓.
