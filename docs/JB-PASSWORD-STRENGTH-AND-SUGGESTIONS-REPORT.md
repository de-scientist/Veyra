# JB Password Strength & Suggestions — Implementation Report

**Status:** IMPLEMENTED (with limitations in §14–§16).
**Date:** 2026-10-11.
**Scope:** Password-strength analysis + strong-password suggestions for registration
and the authenticated password-change flow. Login is deliberately untouched by
gating. No backend, session, commerce, or payment code was changed.

---

## 1. Chosen `zxcvbn` implementation and package

Installed in `apps/web` (frontend-only) via the npm workspace
(`npm install --workspace @veyra/web …`; `apps/web/package.json` + root
`package-lock.json` updated):

| Package | Version | Role |
|---------|---------|------|
| `@zxcvbn-ts/core` | `^4.2.0` | Maintained TypeScript estimator (per-instance `ZxcvbnFactory`, no globals) |
| `@zxcvbn-ts/language-common` | `^4.1.3` | Keyboard graphs + common dictionaries |
| `@zxcvbn-ts/language-en` | `^4.1.1` | English dictionaries + translated feedback |

**Why this over the original `zxcvbn` (4.4.2):** the original was last published
in 2017, ships untyped, and is an ~800 KB monolith. `@zxcvbn-ts` v4 is actively
maintained, natively typed (no `@types` shim), ESM, modular (graphs/dictionaries
split per language), and exposes a per-instance factory — which enables clean
dependency injection in tests instead of mutating a global singleton. Only one
implementation was installed; no competing estimator exists in the tree.

## 2. Files and components created or modified

| File | Change |
|------|--------|
| `apps/web/lib/password-strength.ts` | **New.** Typed service: lazy estimator loader, `analyzeStrength` mapping, `getPasswordStrength`, `suggestPasswords` generator, `copyPasswordToClipboard`. Flat `lib/` location matches `auth-validation.ts` (the task's `lib/auth/` path was adapted to repo convention). |
| `apps/web/components/PasswordStrengthMeter.tsx` | **New.** Reusable meter + feedback + suggestions UI, used by registration and password change. |
| `apps/web/components/AuthForms.tsx` | Register form mounts the meter via `next/dynamic` (`ssr: false`); explicit `applySuggestedPassword` form-state rule. Login form untouched. |
| `apps/web/app/account/security/page.tsx` | Password-change form mounts the shared meter with the same suggestion rule. |
| `apps/web/app/globals.css` | **New** `.pw-strength*` styles on existing JB tokens (no new palette). |
| `apps/web/lib/password-strength.test.ts` | **New.** 34 tests. |
| `apps/web/package.json`, `package-lock.json` | The three new dependencies. |

## 3. Strength-score interpretation

Estimator scores map 1:1 to the required labels (`STRENGTH_LABELS`):
0 Very weak · 1 Weak · 2 Fair · 3 Strong · 4 Very strong.
Empty input renders a neutral state (“Enter a password”, empty bar, no label) —
never red. Scores 0–1 use the error colour, 2 warning, 3 info/brand, 4 success,
**always paired with text** (never colour alone). Crack-time figures use the
offline slow-hashing estimate and are labelled as model-based approximations.
Labels describe the estimator's assessment, not a security guarantee.

## 4. Password-suggestion generation strategy

1. Estimator feedback explains *why* the current password is weak (warning + ≤2 advice).
2. On explicit request (“Suggest a strong password”), independent 16-character
   candidates are drawn from a 64-char unambiguous alphabet (no `0O1lI`).
3. Every candidate is evaluated with the estimator; the best 3 are shown with
   honest labels, preferring score 4.
4. All candidates satisfy the backend format (8–128 chars, unrestricted charset).
5. If candidates keep missing the target, generation stops after a bounded number
   of attempts and returns the strongest found with an honest notice — never an
   infinite loop, never an inflated label.

## 5. Cryptographic randomness and candidate validation

- Source is `crypto.getRandomValues` (injectable `randomValues` for tests); failure
  (missing API) rejects loudly so the UI shows an error state instead of weak output.
- `Math.random`, hard-coded passwords, timestamps, and personal data are never
  used — the generator's signature accepts no personal inputs at all (asserted).
- The 64-char alphabet makes `& 63` indexing **exactly uniform** (64 divides 256),
  so there is no modulo bias; the alphabet-length invariant is itself tested.
- 16 chars × 6 bits ≈ 96 bits; real-estimator test confirms generated candidates
  reach score 4 with `targetMet: true`.

## 6. Registration integration

- The meter analyses as the user types (name/last-name/email passed as
  `userInputs` for personal-data matching), shows after input begins, and offers
  suggestions behind a “Suggest a strong password” button (progressive disclosure).
- **Defined apply rule:** explicit “Use this password” fills **both** password and
  confirmation (a random 16-char secret cannot be retyped), marks both
  dirty/touched, and revalidates; later manual edits validate independently, so
  confirmation can never stay stale-valid. All other values are preserved.
- Submission still requires only the backend policy (min 8, confirmation match);
  server errors and success flow through the existing `AuthAlert`/session/redirect
  machinery unchanged.

## 7. Login behaviour

Login is byte-for-byte unchanged: no meter, no score gate, no confirmation, same
`current-password` autocomplete, visibility toggle, generic error handling, rate
limits, and status enforcement. Weak existing passwords sign in exactly as before
(non-interference is test-asserted). Strength exists to help users *create*
passwords, never to lock anyone out.

## 8. Password-change/reset integration

- **Change (`/account/security`, `POST /account/security/password`):** integrated —
  meter + suggestions on the new-password field with the same apply rule. Current-
  password requirement, backend verification, other-session revocation, and audit
  logging are untouched.
- **Reset:** NOT IMPLEMENTED — no reset endpoints exist (`PasswordResetToken` model
  only, flow NOT VERIFIED per `docs/AUTHENTICATION.md`). Nothing was invented; the
  login form still points at phone support.

## 9. Backend password policy

Unchanged and authoritative: register/login `min 8` (register has no max; client
never sends more than needed); change requires current password (verified with
bcrypt), new password 8–128, confirmation match (`400 INVALID_PASSWORD` /
`WEAK_PASSWORD` / `PASSWORD_MISMATCH`); bcrypt cost 12; other sessions revoked in
the same transaction; `PASSWORD_CHANGED` audit + security event. No client score
or `isStrong` flag is sent or trusted — the payloads are exactly as before.

## 10. Security and privacy protections

Local-only estimation (no external service, no network call with password text);
no logging of passwords, candidates, or clipboard contents; no persistence
(local/session storage absent — asserted); clipboard only on explicit action with
graceful fallback; suggestion state is ephemeral component state cleared on
unmount; error mapping unchanged (no secret/internal leakage).

## 11. Accessibility improvements

Labelled `progressbar` (min/max/now/valuetext) + visible text label; score-*change*
announcements via polite live region (no per-keystroke noise); neutral empty
state; real buttons with focus styles and 44 px targets; `details/summary`
explanation; copy success/error via `role="status"`; responsive actions (full-width
buttons ≤ 640 px); reduced-motion covered by the global reset; JB token colours in
both themes.

## 12. Bundle/performance considerations

- Estimator + dictionaries load **only** after first non-empty input in a mounted
  meter, via dynamic `import()`; the meter itself is `next/dynamic(ssr: false)` in
  `AuthForms`, so **login never loads any of it**.
- Verified in the production build: dictionaries ship in a separate ~371 KB async
  chunk, the meter in small async chunks — none in shared/first-load bundles.
- Analysis is capped at 256 chars per check (estimator default), runs
  synchronously in-effect (millisecond-scale), and skips entirely while empty. No
  debounce was needed; no artificial delays were added.

## 13. Tests run and their actual results

| Check | Result |
|-------|--------|
| New `password-strength.test.ts` (34: labels, mapping, real estimator, generator, clipboard, SSR contracts, integration contracts) | **34/34 PASS** |
| Full `npx vitest run` (62 files) | **575/575 PASS** (incl. prior auth suites + previously flaky commerce concurrency) |
| `typecheck` `@veyra/web` / `@veyra/api` | **PASS / PASS** |
| `lint` `@veyra/web` (`next lint`) | **PASS** (only 4 pre-existing `no-img-element` warnings in unrelated files) |
| `lint` `@veyra/api` | **PASS** (1 pre-existing unused-var warning) |
| `next build` `@veyra/web` | **PASS**, 60/60 routes |

Component interaction beyond static rendering (live typing → meter, Use →
field update) is covered by contract tests because the repo has no browser/
component-mounting tooling; `AuthForms` needs `next/navigation` at runtime.

## 14. Known limitations

1. Live meter/suggestion interaction verified by contract + unit tests only (§16).
2. Estimator feedback is English-only (ships with `language-en`).
3. First use downloads ~371 KB of dictionaries (only on password-creation routes,
   only after typing begins).
4. `userInputs` personalisation is wired on registration only; the security page
   has no name/email at hand and analyses without them.
5. `tsconfig.tsbuildinfo` is tracked in git and dirtied by builds (pre-existing).

## 15. Unresolved policy decisions

**No mandatory minimum zxcvbn score was introduced** (deliberate, documented):
the backend enforces minimum length only, and blocking registration/change on a
client-side estimate would lock out legitimate users unless the backend enforced
the same rule with a migration story. The UI therefore *strongly encourages*
score-4 passwords (suggestions aim for 4) without gating. If product approves a
mandatory minimum later, it must be enforced server-side first, with frontend and
backend validation updated together.

## 16. Browser/E2E verification status

**NOT VERIFIED in a browser.** No browser automation exists in this environment,
so live typing→meter updates, suggestion select/regenerate/copy flows, theme
rendering, responsive behaviour, and screen-reader announcements were **not
executed**. Responsive/a11y behaviour was verified statically (token-driven CSS,
44 px targets, live-region discipline, SSR contract tests). A manual
device/browser + assistive-technology pass is recommended before sign-off.
