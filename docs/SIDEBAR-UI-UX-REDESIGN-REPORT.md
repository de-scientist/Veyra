# Sidebar UI/UX Redesign Report — JB Mercantile Operations

Status: IMPLEMENTED · Verified: typecheck + lint + 411 tests + production build pass.
Date: 2026-10-01. Scope: admin sidebar only (`apps/web/app/admin/AdminShell.tsx`
+ supporting styles/helpers). No auth, RBAC, route, or business-logic changes.

## 1. Existing sidebar architecture

- `apps/web/app/admin/AdminShell.tsx` — client-component shell for all
  `/admin/*` routes (mounted by `apps/web/app/admin/layout.tsx`). Mobile
  drawer via shared `useModalFocus` (`components/a11y.tsx`); logout confirm
  via shared `useConfirm`/`JBConfirmDialog`; icons via `JBIcon`
  (`components/JBIcons.tsx`); artwork via `JBLogo` (`components/JBLogo.tsx`,
  `jb-logo.png` / `jb-navbar.png` in `apps/web/public/`).
- Session: shell issued its own `getSessionUser()` (`lib/admin-api.ts`)
  instead of the authoritative `SessionProvider` cache (`lib/session.tsx`,
  HttpOnly-cookie `/auth/me`, `notifySessionUpdated` sync).
- RBAC (frontend, UX-only): `isOperationsRole` gate for the whole shell,
  `isSuperAdminRole` hiding `/admin/users` + `/admin/roles`. Canonical
  permission helper `can()` in `lib/admin-api.ts`; backend re-authorizes.
- Theme: `ThemeProvider` (`light`/`dark`/`system`, `data-theme` tokens in
  `app/globals.css`). Avatar: `UserAvatar` + `getInitials`/`getDisplayName`
  (`lib/avatar.ts`) — existed but was unused in the admin shell.

## 2. Problems identified

1. Flat 19-item link list, no operational grouping; `Settings` and
   `Attributes` shared the same `sliders` icon.
2. Brand row read `JB OPS` + raw role slug badge (`super_admin` exposed to
   users); full lockup PNG squeezed at 30 px with unreadable tagline.
3. Identity footer was muted plain text (name + email) + `text-button`
   logout — no avatar, no human-readable role, no profile/security links.
4. No collapsed desktop mode; no section collapsing; no skeleton (layout
   jump on `Checking admin access…`).
5. Loading state re-rendered the whole nav each session fetch; shell
   ignored `SessionProvider`, so profile/avatar edits did not reflect
   without a full refresh.
6. Active state relied on a solid-blue block only.

## 3. Design decisions

- Grouped IA in a single canonical module `apps/web/lib/admin-nav.ts`:
  Overview · Catalogue · Orders & Fulfillment · Customers · Commerce ·
  Insights · System. Every `href` maps to an existing `app/admin/*`
  directory — no invented links (no Delivery/Exchanges pages exist).
- Sections are collapsible (button + `aria-expanded`, persisted in
  `sessionStorage`); active section auto-expands; desktop collapse toggle
  persisted in `localStorage` (`264px` → `76px` via CSS variables).
- Identity block reuses `UserAvatar` (image → initials → `?` fallback),
  `getDisplayName`, and new `formatRoleLabel` (`super_admin` → `Super
  Admin`); dropdown reuses existing `/account/profile`,
  `/account/security` routes and the shared logout flow.
- Shell now consumes `useSession()` (authoritative cache + free
  `notifySessionUpdated` sync) instead of a second `/auth/me` fetch.
- Auth-gate semantics preserved: protected children render only after the
  session is confirmed (see §13).

## 4. Logo treatment

- Expanded: `JBLogo variant="compact"` (`jb-navbar.png`, height 30) +
  `JB Mercantile` / `Commerce Platform` text hierarchy (brand strongest).
- Collapsed: `JBLogo variant="full"` (`jb-logo.png`, square lockup,
  height 36), centered. Aspect ratio preserved; dark-mode legibility via
  existing `.jb-logo-chip` (no filters on artwork).

## 5. User/role treatment

- Avatar (real `avatarUrl`, Cloudinary-optimized, broken-image recovery) →
  deterministic initials (`lib/avatar.ts`, unit-tested) → never a broken icon.
- Name truncated with `title` tooltip; role as muted uppercase pill
  (`Super Admin`), visually subordinate. Long names cannot break layout
  (ellipsis + max-width + tooltip).
- Identity dropdown: Profile / Security / Sign out; Escape closes with
  focus return; click-outside closes; `JBConfirmDialog` for logout (never
  `window.confirm`); no `window.location.reload()`.

## 6. Navigation hierarchy

`ADMIN_NAV_SECTIONS` (`lib/admin-nav.ts`) — Overview (Dashboard);
Catalogue (Products, Categories, Collections, Attributes, Inventory);
Orders & Fulfillment (Orders, Payments, Fulfillment, Returns); Customers
(Customers, Reviews); Commerce (Coupons, Notifications); Insights
(Analytics); System (Audit Logs, Settings, Users*, Roles* — *super-admin).

## 7. RBAC integration

- No second RBAC system: filtering via existing `isSuperAdminRole`;
  `visibleNavSections()` drops empty sections. `can()` untouched.
- Backend remains authoritative; shell keeps the `isOperationsRole` gate
  and server-side logout revocation + redirect.

## 8. Responsive behavior

- Desktop: sticky sidebar (`100vh`, independent nav scroll, fixed
  identity/footer), collapse toggle with tooltips + `aria-label`s.
- ≤900 px: drawer (`useModalFocus` trap/Escape/scroll-lock/focus-restore),
  overlay, close-on-navigate, collapse control hidden; identity menu
  becomes full-width. Tokens only — no hard-coded colors.
- Code-verified at CSS level; browser/device testing NOT performed
  (no device lab in this environment).

## 9. Theme behavior

- All new CSS uses `var(--jb-*)` tokens; active state
  (`--jb-primary-soft` bg + `--jb-primary` indicator/text, with
  dark-theme `--jb-primary-strong` accents); verified by token audit, not
  screenshots. `prefers-reduced-motion` disables sidebar transitions.

## 10. Accessibility changes

- Semantic `<nav aria-label="Admin navigation">`, `aria-current="page"`,
  section `aria-label`s, labelled collapse/drawer/identity controls,
  visible `:focus-visible` rings (inherited), active state via shape +
  background + indicator (never color alone), skeleton exposed as
  `role="status"`. No automated axe/browser run — code-audit only.

## 11. Components changed

- `apps/web/app/admin/AdminShell.tsx` (rewrite, same exports/route).
- `apps/web/app/globals.css` (appended `JB operations sidebar` block).
- `apps/web/lib/admin-nav.ts` (new) + `apps/web/lib/admin-nav.test.ts`
  (new, 14 tests). Untouched: auth, RBAC, API, pages, theme, icons.

## 12. Tests performed

- `npm run typecheck --workspace @veyra/web` — pass.
- `npm run lint --workspace @veyra/web` — 0 errors (4 pre-existing
  `<img>` warnings in unrelated files).
- `npm test` (full repo) — 53 files / 411 tests pass, incl. 14 new
  `admin-nav` tests (role labels, visibility filtering, active matching).
- `npm run build --workspace @veyra/web` — pass (static + dynamic routes).
- `git grep` conflict markers — none; `git diff --check` — clean.

## 13. Routes verified

- Build prerendered all `/admin/*` pages successfully. During work a
  regression was caught and fixed: the first rewrite rendered `children`
  in the loading state, which forced static prerender of
  `/admin/orders` + `/admin/inventory` (bare `useSearchParams`, no
  Suspense) and broke the build — proven via isolated worktree bisection
  against baseline `112be00`. Fix: gate children behind confirmed session
  (prior semantics). Direct runtime walkthrough of admin pages was NOT
  performed (no running API/database in this environment).

## 14. Known limitations

1. `/admin/orders` + `/admin/inventory` use `useSearchParams` without a
   Suspense boundary (pre-existing). Safe today because the shell gates
   children; any future shell change that renders children pre-session
   will re-break `next build`. Recommended follow-up: wrap those pages
   in Suspense (out of scope for this sidebar task).
2. No screenshot/browser, screen-reader, or device-lab validation.
3. `Settings`/`Attributes` still share the `sliders` icon (existing
   `JBIcon` set has no gear); icon-set extension deferred.
4. No version string in the sidebar footer (no reliable version source).
