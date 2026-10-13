# JB Mercantile — Google Sign-In Button Visibility Fix (IMPLEMENTED)

Status: **IMPLEMENTED** (verified 2026-10-13 — typecheck, lint, unit + DB tests, web build all executed).

## 1. Root cause

The buttons were implemented in the correct, mounted components — no orphan components, no wrong page. Two compounding causes hid them:

1. **Backend reports `configured: false` (primary).** `GET /api/v1/auth/google/status` returns `{ success: true, data: { configured: isGoogleConfigured() } }` (`apps/api/src/routes/google-auth.ts:118-120`), and `isGoogleConfigured()` requires **both** `GOOGLE_CLIENT_ID` **and** `GOOGLE_CLIENT_SECRET` (`apps/api/src/lib/googleAuth.ts:54-60`). The environment sets `GOOGLE_CLIENT_ID` but **no `GOOGLE_CLIENT_SECRET`** (absent from both `.env` and `.env.example`). Verified live: `GET http://localhost:3001/api/v1/auth/google/status` → `{"success":true,"data":{"configured":false}}`. Both forms render the button only under `{googleConfigured ? … : null}` (`apps/web/components/AuthForms.tsx`), so both buttons were correctly-but-silently hidden. The OAuth implementation itself (PKCE + state + nonce, `sub`-keyed identity, customer-only registration, no email auto-link, reauth-gated linking, audit logging) is complete and untouched.
2. **Frontend failure mode is silent (compounding).** `getGoogleStatus()` caught *every* error and returned `{ configured: false }` (`apps/web/lib/google-auth.ts:44-50`), so a down backend, CORS rejection, or wrong `NEXT_PUBLIC_API_URL` masqueraded as "OAuth unconfigured" with zero diagnostic. Additionally, the loading state (`null`) rendered nothing — no explicit handling, so the button could never appear until the request resolved.

No frontend/backend shape mismatch exists (both use `{ configured }` under the standard `{ success, data }` envelope), no CSS clipping (`.google-button` is full-width, theme-token styled, `min-height: 48px`), and no unmounted duplicates (only `LoginForm`/`RegisterForm` in `AuthForms.tsx`, mounted by `app/login/page.tsx` and `app/register/page.tsx`; no auth layout, no `(auth)` group).

## 2. Files changed and why

- **`apps/web/lib/google-auth.ts`** — `getGoogleStatus()` now rethrows on network/HTTP failure instead of fail-closing to `{ configured: false }`. Callers distinguish "status unreachable" from "genuinely unconfigured". Success path and `googleStartUrl()` (backend `…/auth/google/start?redirect=`, safe-redirect preserved) unchanged.
- **`apps/web/components/GoogleSignInButton.tsx`** — new `useGoogleAvailability()` hook with four explicit states (`loading | ready | unconfigured | unreachable`); `useGoogleConfigured()` kept as a backwards-compatible boolean alias. New `GoogleLoadingButton()` (disabled, `aria-busy`, "Checking Google sign-in…") and shared `GoogleAuthSection({ redirect, disabled, context })` rendering identical placement on both pages: real `Continue with Google` button (full-page backend redirect, native `<button>` with `aria-label`, keyboard accessible) above email/password, separated by the existing "or" divider; register keeps its customer-account note. Unreachable → muted `role="note"` diagnostic (email sign-in still works); unconfigured → dev-only hint naming `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, production renders nothing (existing fallback, never a fake button). OAuth flow, session cookie, and security model untouched.
- **`apps/web/components/AuthForms.tsx`** — `LoginForm` and `RegisterForm` each replaced their `{googleConfigured ? … : null}` block with `<GoogleAuthSection redirect={target} disabled={busy} context="login"|"register" />`. Email/password logic, validation, redirects, and callback alerts unchanged.
- **`apps/web/lib/google-auth.test.ts`** — added: genuine configured/unconfigured passthrough, and rejection (not `{configured:false}`) on network failure and HTTP 500.

Backend, schema, env files, and styles unchanged (no migration, no new library, no Google browser SDK — the flow remains backend-managed redirect).

## 3. Confirmation for both active forms

| State | Login (`/login` → `LoginForm`) | Register (`/register` → `RegisterForm`) |
|---|---|---|
| Status loading | Disabled "Checking Google sign-in…" + divider | Same |
| `configured: true` | Real **Continue with Google** → backend start flow with encoded safe `redirect` + divider | Same + customer-account note |
| `configured: false` | No button (dev-only config hint) | No button (dev-only config hint) |
| Request fails | No button + "status couldn't be reached" note | Same |

## 4. Verification results (all executed 2026-10-13)

- `npm run typecheck` (api + web): clean.
- `npm run lint`: 0 errors (only pre-existing warnings: one unused var in api `storefront.ts`, pre-existing `next/img` notices).
- `npx vitest run apps/web/lib/google-auth.test.ts`: 8/8 pass (6 pre-existing + 2 new).
- `npx vitest run apps/web/lib`: 24 files, 259/259 pass (email/password auth suites unaffected).
- `npx vitest run apps/api/src/routes/google-auth.test.ts`: 14/14 pass (status, start/callback, customer-only registration, no email auto-link, reauth-gated link/unlink, lockout guards, password auth intact).
- `npm run build --workspace @veyra/web`: compiled successfully, 60/60 static pages (incl. `/login`, `/register`).
- Live check: backend status endpoint reachable, returns `configured: false` without the secret — matching the fixed UI's unconfigured branch.

Browser verification (Phase 5): no browser tooling in this environment, so live Google redirect was **not** exercised. The button navigates to the existing, test-covered backend start endpoint (`302` to Google with state/PKCE/nonce, covered by the 14 backend tests); only real Google Cloud credentials can prove the provider round-trip.

## 5. Remaining configuration required

1. **Set `GOOGLE_CLIENT_SECRET`** (backend env only — never `NEXT_PUBLIC_` prefixed) alongside the existing `GOOGLE_CLIENT_ID`. Without it the buttons stay hidden by design. `GOOGLE_REDIRECT_URI` defaults to `http://localhost:3001/api/v1/auth/google/callback` locally; production requires the exact URI registered in Google Cloud.
2. Optional hygiene (not changed, out of scope): `.env.example` contains an unrelated `VITE_GOOGLE_CLIENT_ID` entry (no code references it) and a duplicate `GOOGLE_CLIENT_ID` line — worth a cleanup pass so future readers aren't misled into adding a frontend client ID; the flow needs none.
3. After setting the secret, reload `/login` and `/register`: the buttons appear once `GET /api/v1/auth/google/status` reports `configured: true`; clicking either must land on Google's consent page and return via the existing callback.
