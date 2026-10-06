# Checkout Authentication Guard & Branded Loading Experience — Report

Status: IMPLEMENTED. All verification commands executed and passing (see §10).

## 1. Existing architecture (before this task)

**Authentication/session.** Cookie-based only: `veyra_session` HttpOnly cookie
(`SameSite=Lax`, `Secure` in production), never exposed to client JavaScript.
`GET /auth/me` is the single session source; the web `SessionProvider`
(`apps/web/lib/session.tsx`) caches it once per mount with three states —
`loading` (unknown), `guest`, `authenticated` — and revalidates via the
`jb:session-updated` event after login/logout/profile changes. No JWT, no
localStorage tokens. Login already supported a safe internal return path:
`safeRedirectTarget()` in `AuthForms.tsx` accepts only same-origin `/…`
targets for the `redirect` query parameter (blocks `//evil`, `http:`,
`javascript:`), defaulting to `/account`. The admin shell (`AdminShell.tsx`)
already demonstrated the guard pattern: wait for `loading` → `router.replace(
/login?redirect=…)` for guests. No second auth system was introduced.

**Cart.** Guests and customers share one cart system (`apps/api/src/lib/
shopping.ts`). Guest carts live under the `veyra_guest_cart` HttpOnly cookie;
`getOrCreateCart` automatically merges an active guest cart into the user cart
on the first authenticated read (quantity capped by stock and the 20-unit
limit, price snapshots refreshed to authoritative values, guest cart retired
to `MERGED`). Cart endpoints (`GET/PATCH/POST/DELETE /cart…`) remain public
by design — guests keep browse/add/view.

**Checkout (before).** `POST /checkout/preview` and `POST /checkout` accepted
guests (`getSessionUserId` optional, `guest:` idempotency scope). The web
`/checkout` page rendered the form immediately with `JBPageLoader message=
"Loading checkout…"` and no session check — guests could open checkout and
place orders.

**Loading.** `JBLoading.tsx` exported `JBPageLoader` (logo pulse + text),
`JBButtonLoader`, skeletons (`ProductCardSkeleton`, `ProductGridSkeleton`,
`ProductDetailSkeleton`, `CartSkeleton`), `JBAlert`, `QuantityStepper`.
Route `loading.tsx` files used skeletons for discovery routes. No percentage,
no contexts, no tagline. The canonical brand tagline in the repo is
`Fashion • Footwear • Kitchen & Home` (site footer `site-footer__tagline`,
homepage title) — reused verbatim; no new slogan invented.

## 2. Checkout authentication (frontend)

`apps/web/components/CheckoutPageClient.tsx` now gates on the shared session:

- `status === 'loading'` → branded `<JBLoading context="checkout" />`. No
  redirect on an unresolved session (no redirect flicker).
- `status === 'guest'` → `router.replace('/login?redirect=%2Fcheckout')`
  after a 350 ms minimum loader dwell (anti-flash only; no multi-second
  delay). `replace` keeps history loop-free: Back from login returns to cart.
- `status === 'authenticated'` → cart/options/saved-addresses load, then the
  form renders. The form, cart fetch, and order calls are unreachable before
  authentication is confirmed.
- 401 mid-checkout (revoked/expired session during load, preview, or place)
  redirects to login instead of stranding the customer. `lib/shopping-api.ts`
  `request()` now preserves backend `code`/`details` (same shape as
  `lib/admin-api.ts`) so the guard detects `UNAUTHENTICATED` without parsing
  messages — additive, no message changes.
- Empty cart still renders the existing branded empty-cart state with
  `Continue Shopping` (`/shop`).

`AuthForms.tsx`: `LoginForm` already returned to `?redirect=`; both forms now
also redirect an already-authenticated visitor away from `/login`/`/register`
(no loops), and `RegisterForm` honors the same safe `redirect` parameter
(`register/page.tsx` gained the required `Suspense` boundary). Single
`redirect` parameter everywhere — no duplicate.

## 3. Backend protection

`apps/api/src/routes/checkout.ts`:

- `POST /checkout/preview` and `POST /checkout` now have `preHandler:
  requireAuth` (session validity + active-account enforcement). Guests get
  `401 UNAUTHENTICATED`.
- Order scope is always `user:{id}`; guest scopes are gone. `getOrCreateCart`
  still merges any guest cart into the user cart inside these calls.
- Unchanged and intentionally public: `GET /checkout/options` (browsing),
  all `/cart…` endpoints (guest cart), `GET /orders/:orderNumber`
  (confirmation-token access for receipts/tracking), claim-guest-order flow
  (historical guest orders remain claimable).
- No order is created by opening `/checkout` — creation happens only on
  explicit submit (`placeCheckout` with `Idempotency-Key`), now always
  authenticated and linked to the customer (`userId` non-null).

## 4. Cart preservation

No new merge system. The pre-existing `getOrCreateCart` merge covers the
Guest → Checkout → Login → Checkout journey: items, quantities, price-change
flags, availability, and backend-revalidated prices/stock/totals all behave as
before; checkout rejects stale snapshots unless confirmed, and clients never
set prices. Covered by `commerce.test.ts` (`guest cart survives refresh via
cookie and merges into the user cart on login`) and the smoke test's merged
checkout.

## 5. Loading architecture

`JBLoading.tsx` was extended, not duplicated:

- New `JBLoading` full-page loader: official `JBLogo` (pulse), CSS spinner
  ring, `JB Mercantile`, canonical tagline, animated percentage + progress
  bar, contextual message. No new files (`Loading.tsx`, `GlobalLoader.tsx`,
  etc. were not created).
- `JBPageLoader` is preserved as a thin backward-compatible wrapper.
- All skeletons, `JBButtonLoader`, `JBAlert`, `QuantityStepper` untouched.
  Skeletons remain the pattern for product grids, PDP, discovery routes, and
  cart lines; `JBLoading` is used for route transitions, auth resolution, and
  full-page data loads. New route `loading.tsx` files: home, cart, checkout,
  account, account/orders, wishlist, admin (existing skeleton `loading.tsx`
  files for shop/product/category/collection/search untouched).
- In-page full-state loads now use contexts: account dashboard
  (`context="account"`), orders list (`"orders"`), wishlist (`"wishlist"`),
  checkout guard (`"checkout"`).

## 6. Contextual messages

`JB_LOADING_MESSAGES` (`context` prop, optional `message` override):

| context | message |
|---|---|
| home | Your store is loading... |
| shop | Our products are loading... |
| product | Product details are loading... |
| cart | Your cart is loading... |
| checkout | Your checkout is loading... |
| account | Your account is loading... |
| orders | Your orders are loading... |
| wishlist | Your wishlist is loading... |
| admin | Your dashboard is loading... |
| default | Loading... |

## 7. Percentage behavior

`useJBVisualProgress(done)` is explicitly a **visual indicator, not measured
network progress**: starts at 3%, eases out (`ceil(remaining/12)` every
90 ms), caps at 99% while pending, jumps to 100% only when the caller sets
`done`. Interval is cleared on unmount; no updates survive unmount; values
never exceed 100, go negative, or reset. No artificial multi-second delay
anywhere — the only fixed dwell is the 350 ms checkout-guard minimum against
flashing.

## 8. Accessibility

One static `role="status"` announcement carries the message; the ticking
percentage and visuals are `aria-hidden`, so screen readers hear e.g. "Your
cart is loading..." once — never "1%, 2%, 3%…". Under
`prefers-reduced-motion` the percentage/bar are omitted for a static message
(CSS animations are additionally neutralised by the existing global
reduced-motion rule). Spinner is decorative CSS with no external icon library.

## 9. Theme

Pure existing JB tokens (`--jb-primary`, `--jb-surface-muted`,
`--jb-border`, `--jb-text-muted`, …); light/dark via `[data-theme]`,
including the dark navy palette. No hard-coded backgrounds. Logo renders
through the existing `JBLogo` chip handling. Mobile keeps the same hierarchy
with reduced padding via the existing 640 px breakpoint.

## 10. Testing

Commands executed (all PASS):

- `npm run typecheck` (api + web): PASS.
- `npm run lint` (api + web): PASS — 0 errors; only pre-existing warnings
  (`DISCOVERY_PAGE_SIZE` unused var; Next `no-img-element` suggestions).
- `npx vitest run` (full suite): **59 files, 484 tests, all pass**, including
  updated suites: `security.test.ts` (checkout endpoints in the guarded list;
  401-before-validation plus authenticated idempotency-key test),
  `smoke.test.ts` (guest 401 probe + merged authenticated checkout),
  `commerce.test.ts` (guest preview/place 401; per-test customers for all
  checkout flows; merge/price/validation/idempotency/concurrency preserved),
  `fulfillment.test.ts`, `fulfillment-eligibility.test.ts`,
  `payments.test.ts` (guest→authenticated fixture checkouts).
- `npm run build` (api + web): PASS (route table emitted; prerender
  `ECONNREFUSED` log lines are the pre-existing handled fallbacks —
  pages degrade via `.catch(() => [])` with no API running at build time).
- Regression grep (§43: `params.then`, `await params`, `use(params)`,
  `target.value`, `sessions.filter`, `window.confirm/alert/reload`): no new
  occurrences in touched files; all hits are pre-existing correct patterns.
- Manual browser checks (guest→login→checkout, loader visuals per theme,
  reduced motion): NOT VERIFIED — no browser automation in this environment
  (see §11). The journey is covered at API level (401 for guests, merge +
  order for authenticated) and the guard logic follows the proven AdminShell
  pattern.

Notable finding while testing: converting fixtures to authenticated checkout
initially added one HTTP request per order, pushing `fulfillment.test.ts`
from 106 to 119 requests against the global 100-request/60 s test budget and
causing late-file 429s. Fixed by merging inside the checkout call (combined
session+guest cookie, no extra round-trip); explicit merge coverage stays in
`commerce.test.ts` and the smoke test. A secondary benefit of the change:
customer-owned orders now flow through real shipping notifications (guest
orders were silently skipped by the worker for lack of a recipient).

## 11. Remaining limitations

- Browser-level verification (visual loader, percentage smoothness,
  light/dark/system switching, reduced-motion rendering, mobile layout,
  Back-button history, hydration console) is NOT VERIFIED here; recommended
  manual pass: logged-out `/checkout` → login → back to checkout with cart
  intact; empty-cart checkout; expired-session-mid-checkout.
- `apps/web/tsconfig.tsbuildinfo` was regenerated by the build (tracked
  artifact, harmless).
- Historical `PHASE-*-REPORT.md` files were not rewritten.
