# Phase B Report — Design System, Authenticated Navbar & Account Experience

## 1. Executive Summary

Phase B transformed the global Header from a static `Sign in → /login` link
into a session-aware control with three explicit states
(`loading` skeleton → `guest` Sign In → `authenticated` avatar + account menu),
added a reusable `UserAvatar` (image with deterministic initials fallback and
broken-image recovery), a permission-gated account dropdown, auth-aware mobile
navigation, and a single shared client session cache. No authentication,
RBAC, or schema logic was rewritten; no Cloudinary, media, catalogue, or
storefront-data work was attempted.

## 2. Existing Authentication Architecture (reused, not replaced)

- Server-side cookie sessions (`veyra_session`, HttpOnly, SameSite=Lax,
  Secure in production, 7-day expiry, SHA256 token hash, revocation,
  ACTIVE-only users) — `apps/api/src/routes/auth.ts`,
  `middleware/auth.ts`. Untouched.
- Reused endpoints only: `GET /auth/me` (session source of truth; already
  serializes `avatarUrl`) and `POST /auth/logout` (server revocation).
- RBAC: frontend `can('dashboard.read', roles)` (`lib/admin-api.ts`,
  UX-only); backend `requireOperationsAccess`/`requireAdminAccess`/
  `requireSuperAdmin` remain authoritative. Untouched.
- Safe redirects: existing `safeRedirectTarget` (single-`/` paths only).
  Untouched.
- No JWT, no localStorage tokens, no second auth system, no client-controlled
  roles.

## 3. Header Architecture

`components/Header.tsx` (still the single `'use client'` header) consumes the
shared session context:

- **State A — Loading:** brand + navigation + `AccountMenuSkeleton`
  (shimmer avatar placeholder, `role=status`), plus stable mobile-nav
  `Loading account…` text. No Sign In ↔ avatar flicker, no layout shift
  (fixed 32px avatar slot).
- **State B — Guest:** `Sign in → /login` (unchanged link + `user` JBIcon).
- **State C — Customer:** `<AccountMenu>` avatar trigger (`[Avatar] FirstName`,
  avatar-only below 640px).
- **State D/E — Staff/Admin/Super Admin:** same trigger; menu additionally
  lists `Admin Dashboard → /admin/dashboard` iff
  `can('dashboard.read', roles)`. No role names displayed.
- Cart count, notifications count, `ThemeToggle`, mega-menu, and mobile
  disclosure behaviour are preserved.

## 4. User State Flow

```text
GET /auth/me (HttpOnly cookie, credentials:include)
  → SessionProvider (one request per mount, shared context)
    → Header → AccountMenu / AccountNav (consumers, zero extra fetches)
    → profile save / login / register → notifySessionUpdated()
      → jb:session-updated event → provider refresh → navbar updates
    → logout success → clear() → guest state → push('/') + refresh
```

- `AccountNav` was migrated off its private `getSessionUser()` call onto the
  shared context (one fewer `/auth/me` per account page).
- `AdminShell` keeps its own gate (deliberate: it needs redirect semantics
  the shared cache does not own); backend remains the gatekeeper regardless.
- Login/Register forms notify the provider because layout-level context does
  not remount on client navigation — without this the navbar would stay
  guest-state after sign-in.
- Failure/expired session → guest fallback; app stays usable; no backend
  internals exposed.

## 5. Avatar Architecture

```text
session.user.avatarUrl → next/image (unoptimized: provider-agnostic,
Cloudinary-ready, bypasses remote-pattern allowlist) → onError → initials
avatarUrl missing → initials (getInitials: First+Last → 2 letters;
single name → 1; else email local-part; else '?'; code-point safe)
```

- `lib/avatar.ts` (pure): `getInitials`, `getDisplayName`, `getAvatarMenuLabel`.
- `components/UserAvatar.tsx` (`sm|md|lg`, `decorative` flag, theme-token
  chip, `role=img` + label or `aria-hidden` inside labelled controls).
- Trigger button label: `Open account menu for <name>`; header shows only
  name + email — never password/token/role/permission internals.

## 6. Permission Architecture

`can('dashboard.read', roles)` (operations roles: staff/admin/super_admin)
controls: account-menu `Admin Dashboard` entry, mobile-nav admin link, and
(existing) `AccountNav` entry. Single helper, no duplicated logic. **Hiding is
UX only** — verified by the untouched backend matrix: customer `403` on
`/admin/*` (covered by `rbac.test.ts` + `security.test.ts`, all passing).

## 7. Responsive Navigation

- Desktop: trigger with name; dropdown panel anchored right (theme-menu
  pattern, token surfaces).
- ≤640px: name hidden (avatar-only trigger); panel becomes a fixed
  full-width sheet under the header; no overflow (`max-width: 100vw-2rem`).
- Mobile disclosure nav: guest → Sign in; loading → status text;
  authenticated → My Account/Orders/Profile (+Admin Dashboard if permitted)/
  Wishlist/Cart; every link closes the menu; Escape returns focus to toggle.
- Breakpoint/responsive work reuses existing `globals.css` tokens and the
  900px/640px media queries; no new breakpoint system.

## 8. Accessibility

- Semantic `header/nav/button/a/ul/li`; `menu`/`menuitem` roles on dropdown;
  named trigger; `aria-expanded`/`aria-haspopup`; header identity
  `aria-hidden` with a visually-hidden SR equivalent.
- Keyboard: Enter/Space activate; ArrowUp/Down move between items; Escape
  closes + returns focus to trigger; Tab-out dismisses (no trap, no strand).
- Visible `:focus-visible` token ring everywhere; `JBIcon` SVGs only (no
  emoji); `prefers-reduced-motion` disables the skeleton shimmer via the
  existing global rule.
- Dialogs: no `window.confirm`/`alert` added or present in touched files
  (logout needs no confirmation; admin-shell confirm primitive untouched).

## 9. Theme

Light/Dark/System via the existing `ThemeProvider` — no header-local theme
state. New surfaces use `--jb-surface-elevated/--jb-border/--jb-text/
--jb-primary-soft/--jb-skeleton-shine` tokens: avatar chip is Royal Blue in
both themes with white initials; skeleton uses the theme shimmer token;
trigger hover matches nav-link hover. No hard-coded colors.

## 10. Security

- HttpOnly/SameSite/Secure session untouched; server lookup + expiry +
  revocation + ACTIVE-check untouched (verified by reading `auth.ts`/
  `middleware/auth.ts`, exercised by `rbac.test.ts` 20/20).
- No client-only authorization: menu gating is display-only; `/admin`
  redirects (`/login?redirect=`, `/admin/unauthorized`) and API 403s intact.
- No token in localStorage; only theme key in localStorage (pre-existing).
- Data exposure: browser sees the pre-existing safe subset
  (id/email/name/phone/avatarUrl/status + roles); error paths surface generic
  messages only.
- Caching: session state lives in client memory per tab (no shared/static
  cache, no SSR user injection) — User A's avatar cannot render for User B.
  Same-tab sync via event; cross-tab isolation is deliberate (each tab owns
  its cookie session).
- Redirects: existing `safeRedirectTarget` preserved; logout lands on `/`.

## 11. Tests

- New: `apps/web/lib/avatar.test.ts` — 8 tests (initials matrix, display
  name, menu-label safety). `vitest.config.ts` include extended to
  `apps/web/lib/**/*.test.ts` (node env; pure-logic only — no jsdom added).
- Full `npm test`: **15 files, 129 tests, all pass** (14 pre-existing API
  suites incl. RBAC/security/smoke + 1 new web suite).
- `npm run typecheck` (web + api): pass. `npm run lint` (web + api): pass —
  only 4 pre-existing `<img>` warnings in untouched pages.
- `npm run build --workspace @veyra/web`: pass, 54 routes.
- Manual QA (states × themes × widths) is code-reviewed but **browser
  verification at 1440/1280/768/390/360 was not executed in this environment**
  — recommended before sign-off (see §15).

## 12. Files Changed

- New: `apps/web/lib/session.tsx`, `apps/web/lib/avatar.ts`,
  `apps/web/components/UserAvatar.tsx`, `apps/web/components/AccountMenu.tsx`,
  `apps/web/lib/avatar.test.ts`.
- Edited: `apps/web/components/Header.tsx` (session states + mobile auth
  block), `apps/web/app/layout.tsx` (SessionProvider),
  `apps/web/components/AccountNav.tsx` (shared context, −1 fetch),
  `apps/web/components/AuthForms.tsx` (post-auth revalidation),
  `apps/web/app/account/profile/page.tsx` (post-save revalidation),
  `apps/web/lib/admin-api.ts` (SessionUser gains `avatarUrl` — matches
  existing backend serialization), `apps/web/app/globals.css` (avatar/menu/
  skeleton styles), `vitest.config.ts` (web lib test include).
- Untouched: `apps/api/**`, Prisma schema/migrations, theme provider,
  icons, admin shell, catalogue/storefront data.

## 13. Database Changes

```text
No database migration required.
```

`User.avatarUrl` already exists and is already serialized by `/auth/me`;
Phase B consumes it. Avatar provider-metadata fields are deferred to Phase C.

## 14. API Changes

None. Zero endpoints added, removed, or reshaped (frontend type-only
alignment to the existing `/auth/me` response).

## 15. Known Limitations

- Cloudinary profile upload intentionally deferred (Phase C/F): users with no
  `avatarUrl` see initials until then — by design, not a gap.
- Browser-level visual QA (viewports, themes, keyboard walk-through with
  SR) not executed here; recommended pre-release pass.
- `AdminShell` retains its own session fetch (redirect semantics); Header +
  AccountNav share the provider. Minor duplication, documented, not user-
  visible.
- Pre-existing `<img>` lint warnings in 4 untouched pages left as-is.
- Historic `Veyra` internal identifiers and sender defaults untouched per
  AGENTS.md (branding decision pending, out of Phase B scope).

## 16. Phase B Verification

Acceptance criteria (§72 A–J): design system reused; guest/loading/
authenticated/mobile states implemented; avatar + fallbacks + labels done;
menu open/close/Escape/arrows/focus/logout done; dashboard gating via
`can('dashboard.read')` with backend authority intact; existing routes only;
no JWT/localStorage/sensitive leaks; keyboard/focus/semantics/contrast/
reduced-motion addressed; typecheck + lint + tests (129) + build green;
zero out-of-scope work (no Cloudinary/media/CRUD/storefront-cutover/
migration/dependency).

```text
PHASE B COMPLETE
```
