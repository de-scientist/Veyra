# JB Mercantile — Google Sign-In Button Visibility Fix (IMPLEMENTED)

Status: **IMPLEMENTED** (verified 2026-10-13 — typecheck, lint, unit + DB tests, web build all executed).

## 1. Why the button is now always rendered

Earlier iterations gated the button on a preliminary status request: loading rendered
nothing, `configured: false` hid it, and *any* request failure was swallowed into
`{ configured: false }` — silently hiding the button with zero diagnostic. A
follow-up also showed a developer-facing note naming `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, which customers must never see.

The button no longer depends on any preliminary request. `GoogleAuthSection`
(`apps/web/components/GoogleSignInButton.tsx`) renders **Continue with Google**
unconditionally on both `/login` (`LoginForm`) and `/register`
(`RegisterForm`), above the email/password fields with the existing "or"
divider (plus the customer-account note on register). Same shared component,
label, icon, theme tokens, responsive layout, and keyboard-accessible native
`<button aria-label="Continue with Google">` on both pages.

Clicking it runs a lightweight preflight (`checkGoogleStart()` re-reads the
authoritative `GET /api/v1/auth/google/status`) and then uses the unchanged
backend-managed flow (`window.location.href = googleStartUrl(redirect)`,
302 → Google with state/PKCE/nonce, safe redirect preserved). Duplicate
navigation while a start is in flight is blocked (`starting` + `navigating`
guards) with a "Connecting to Google…" loading state. Availability never gates
visibility — it only selects the outcome: navigate, or fail inline.

## 2. What happens when Google OAuth is unavailable

- **Explicitly unconfigured** (`configured: false`, e.g. backend
  `GOOGLE_CLIENT_SECRET` unset): no navigation; the form shows its existing
  `AuthAlert` (`role="alert"`, dismissible): "Google sign-in is temporarily
  unavailable. Please try again shortly or sign in with your email and
  password."
- **Network failure**: "We couldn't connect to Google sign-in. Check your
  internet connection and try again."
- **Backend error**: "Something went wrong while starting Google sign-in.
  Please try again or use email sign-in."
- **Stale preflight** (configured at click, broken by navigation): the
  backend's safe `google_error` callback codes render through the existing
  `googleCallbackMessage` mapping on return (cancelled, email-exists with
  link-from-security guidance, unverified, inactive, expired, provider,
  generic fallback) — unchanged.
- Email/password sign-in and registration stay fully usable throughout;
  retrying clears the stale alert first (`onStartError(null)`), and at most
  one alert exists per failure (the form owns a single `formAlert`).

## 3. Customer-facing error mapping

Centralized in `apps/web/lib/google-auth.ts`:

- `googleStartErrorMessage(kind)` — `unconfigured | unreachable | server`
  (start-flow preflight failures).
- `googleCallbackMessage(params)` — all backend `?google=` /
  `?google_error=` return codes (cancelled, `email_exists`, `email_unverified`,
  `account_inactive`, `invalid_request`, `not_configured`, `identity_taken`,
  `already_linked`, `link_failed`, `provider_error`, `auth_failed`, generic
  unknown fallback).
- No success notification is ever shown before success; raw exceptions, API
  bodies, and backend messages are never rendered.

## 4. Customer/developer separation & sanitized diagnostics

Customer UI never exposes: env var names or setup instructions, stack traces,
raw fetch errors, API URLs/paths, DB/SQL/Prisma text, OAuth
transaction/state/nonce/PKCE/cookie/token values, file paths, or status
codes. (Verified by assertion tests scanning every message, plus a repo grep
confirming no `GOOGLE_CLIENT*`/endpoint strings remain in `apps/web`.)

`logGoogleDiagnostic({ action, kind, status?, code? })` logs
`console.info('[google-auth]', …)` **only** when
`process.env.NODE_ENV === 'development'` — action, failure kind, HTTP status,
and sanitized app code. Never URLs, secrets, tokens, cookies, OAuth material,
raw exceptions, or personal data; silent in production; never the sole
feedback (the form alert always renders alongside).

## 5. Security & functionality preserved

Untouched: authorization-code + PKCE/state/nonce flow, `GET /auth/google/start`
and `/callback`, `veyra_session` cookie and session helpers, `sub`-keyed
identity, customer-only Google registration, no email-match auto-linking,
reauth-gated link/unlink, rate limits (`authLimit`), account-status checks,
RBAC, audit logging, safe-redirect validation, and all email/password,
logout, and session behaviour. The preflight is read-only; it cannot log
anyone in or bypass configuration checks — without valid server configuration
the button visibly remains and fails gracefully.

## 6. Tests executed (actual results, 2026-10-13)

- `apps/web/lib/google-auth.test.ts`: **12/12 pass** — callback mapping,
  genuine configured/unconfigured passthrough, failure-never-masquerades,
  start-message mapping, preflight outcomes (`ok`, `unconfigured`,
  `unreachable`, `server` + status/code), customer-safe scan of all messages,
  dev-only sanitized logging (logs once in development, silent in production).
- `apps/web/lib` full suite: **24 files, 263/263 pass** (email/password
  `auth-validation`/`auth-ux` suites unaffected).
- `apps/api/src/routes/google-auth.test.ts`: **14/14 pass** (status, 302
  start with PKCE/nonce, safe redirects, callback, customer-only
  registration, no auto-link, reauth-gated link/unlink, lockout guards,
  password auth intact).
- `npm run typecheck` (api + web): clean. `npm run lint`: 0 errors
  (pre-existing warnings only). `npm run build --workspace @veyra/web`:
  compiled successfully, 60/60 static pages including `/login`, `/register`.
- Render-path coverage note: no React testing library in this repo (vitest
  node env), so branch rendering is verified by construction — both forms
  mount the same unconditional `GoogleAuthSection`, and all message/decision
  logic it depends on is unit-covered. No browser tooling here, so live
  provider redirect was not exercised; the redirect target is the existing,
  backend-test-covered start endpoint.

## 7. Outstanding live configuration

Set backend `GOOGLE_CLIENT_SECRET` alongside `GOOGLE_CLIENT_ID` (backend env
only — never `NEXT_PUBLIC_` prefixed). `GOOGLE_REDIRECT_URI` defaults to
`http://localhost:3001/api/v1/auth/google/callback` locally; production
needs the exact Google Cloud-registered URI. Until then the button stays
visible and explains unavailability in customer language. Optional hygiene
(untouched, out of scope): `.env.example` carries an unreferenced
`VITE_GOOGLE_CLIENT_ID` line worth removing since the flow needs no frontend
client ID.
