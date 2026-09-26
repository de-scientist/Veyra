# JB Mercantile — Phase E: Final Regression, Accessibility & Responsive QA Report

**Date (UTC):** 2026-09-26
**Brand:** JB Mercantile (Fashion • Footwear • Kitchen & Home). Internal identifiers (`veyra_session`, `@veyra/*`) intentionally preserved.
**Scope rule observed:** validation, correction, and hardening only. No new features, no architecture rewrites.
**Method:** source inspection of `apps/api`, `apps/web`, `prisma/`, contract/regression tests, plus executed `typecheck`, `lint`, `test` (vitest), and production `build`. No live-browser E2E, no assistive-technology session, no M-Pesa sandbox, and no staging perf run were available in this environment — those areas are honestly marked NOT VERIFIED, not claimed.

---

## 1. Executive Summary

Phase E audited the full customer journey (Homepage → Catalogue → Search → Category → Product → Cart → Checkout → Delivery → Order → M-Pesa → Fulfillment → Delivery/Pickup → Account) and the admin operational workflow (Login → Dashboard → Catalogue → Inventory → Orders → Payments → Fulfillment → Delivery → Customers → Notifications → Audit).

**Result: no Critical or High blockers found in source.** The known defect classes from Phases A–D (`params.then`, `sessions.filter`, `Cannot read properties of null (reading 'value')`, `window.location.reload`, `window.confirm/alert`, `div`-inside-`p` hydration failure, bare-date analytics 400, delivery-zone 400) were each re-traced and verified absent or correctly guarded. Three genuine low-severity defects in the hero carousel (empty-slide guard, broken-image fallback, duplicate `<h1>`) were fixed during this phase with regression coverage already present or added by code guard. Automated gates all pass: typecheck clean, lint clean (warnings only), **42 test files / 306 tests pass**, production build compiles all routes.

**Release recommendation: READY WITH DOCUMENTED LIMITATIONS** (see §21; limitations are environment-verification gaps, not application defects).

---

## 2. Scope

Covered per the Phase E directive: runtime regression, merge-conflict check, auth/session/RBAC, navbar, homepage, hero carousel, storefront, product page/media/editor, cart, checkout, delivery zones, orders, payments (static), fulfillment, delivery, account + security page, notifications, coupons, categories, collections, analytics, admin dashboard/chrome, buttons, hydration, semantics, keyboard, focus, screen-reader (static), contrast (static), color-only communication, reduced motion, responsive (code-level breakpoints + CSS rules), themes, loading/error/empty states, images, performance (build-level only), network recovery (code paths), Cloudinary (code paths), security regression (static + authz tests), SEO/GEO. Sections 52/53/54/62 items requiring live environments are marked NOT VERIFIED.

---

## 3. Repository/Environment Tested

- Repo root `C:\Users\gitau\Documents\Veyra`, git worktree with 2 modified files at report time (both Phase E fixes).
- `apps/web` — Next.js 14.2.15 (`apps/web/package.json:12`); dynamic-route params are plain objects (correct for this version).
- `apps/api` — Fastify, `/api/v1`, zod validation, session cookie `veyra_session`.
- `prisma/` — forward-only migrations; no migration changes in this phase; no DB reset performed.
- Prior reports (`docs/PHASE-A/B/C/D*`, root `PHASE-*-REPORT.md`) treated as historical evidence and re-verified against source; agreements and one clarification (§4) below.
- Validation executed: `npm run typecheck` (PASS), `npm run lint` (PASS, warnings only), `npm test` → 42 files / 306 tests PASS, `npm run build` (PASS, all routes compiled), `git diff --check` (clean), `git grep` conflict-marker scan (clean).

---

## 4. Phase A–D Regression Results

| Prior claim | Re-verification | Verdict |
|---|---|---|
| `params.then is not a function` (dynamic routes) | All 7 dynamic routes use plain `params: { slug/id/orderNumber: string }` and read synchronously (`products/[slug]/page.tsx:17,38-39`, `categories/[slug]/page.tsx:15,25-26`, `collections/[slug]/page.tsx:16,26-33`, `admin/products/[id]/page.tsx:29-35`, `admin/orders/[orderNumber]/page.tsx:27-33`, `account/orders/[orderNumber]/page.tsx:11-17`, `order-confirmation/[orderNumber]/page.tsx:7`). Repo-wide grep for `params.then`, `await params`, `use(params)` hits only the guard test `apps/web/lib/route-params.test.ts:39-55` | PASS |
| `sessions.filter is not a function` | Normalization lives at the data boundary: `getSessions()` in `apps/web/lib/shopping-api.ts:666-671` coerces envelope-or-array to `AccountSession[]`, unknown shapes → `[]`. Component (`account/security/page.tsx:13,30-39,203`) always operates on an array. Covered by `apps/web/lib/sessions.test.ts` | PASS |
| `Cannot read properties of null (reading 'value')` (product editor) | Both `admin/products/[id]/page.tsx:46-54` and `admin/products/new/page.tsx:86-93` capture `e.currentTarget.value` synchronously into plain-string setters; price form reads `FormData(e.currentTarget)` synchronously. No event dereference inside async callbacks | PASS |
| Delivery-zone `400 Failed to load resource` | Traced end-to-end: `CheckoutPageClient.tsx:21,27,49,78` (controlled select + missing-selection guard) → `buildCheckoutInput()` omits blank (`shopping-api.ts:407`) → `checkoutSchema` (`apps/api/src/routes/checkout.ts:22-34`, `shippingZoneCode` optional non-empty) → `resolveShipping()` (`apps/api/src/lib/checkout.ts:131-146`) returns typed 400/409 envelopes. Blank-`''` contract pinned by `contracts.test.ts:45` | PASS |
| Analytics overview `400` on `?from=2026-09-25&to=2026-09-27&compare=true` | **Clarified, not a bug:** `rangeSchema` (`apps/api/src/routes/analytics.ts:23-29`) requires full ISO datetime with offset (`z.string().datetime({offset:true})`); bare `YYYY-MM-DD` fails at parse time by design. Web client normalizes via `toAnalyticsDateTime()` (`apps/web/lib/analytics-api.ts:30-44`, appends `T00:00:00+03:00`); correct query passes range rules (`periods.ts:85-98`, 2-day range, not future, under 400d cap). No validation removed | PASS (client-normalized; raw bare-date 400 is intended) |
| `div cannot be a descendant of p` (`PriceDisplay`) | Root is `<span>` with documented rationale (`PriceDisplay.tsx:14-29`); no `suppressHydrationWarning` used for it. `<html suppressHydrationWarning>` in `app/layout.tsx:63` is the standard theme pre-paint pattern only | PASS |
| `window.location.reload / confirm / alert` | Grep: zero runtime uses. `window.location.reload` appears only in a code comment (`AdminOrderFulfillmentPanel.tsx:48`, "never …"); `window.confirm` only in a comment (`FulfillmentQueueClient.tsx:39`, "no window.confirm"). All destructive actions use `JBConfirmDialog` + `useModalFocus` | PASS |
| RBAC frontend-only risk | Backend-enforced: `requireAuth` / `requireOperationsAccess` / `requireAdminAccess` / `requireSuperAdmin` / `requirePermission()` (`apps/api/src/middleware/auth.ts:50-158`); admin order routes guarded (`admin.ts:190,218`); account order ownership enforced server-side (`account.ts:448-451`, 404 if not owner). Covered by `admin-customers-authz.test.ts` (10 tests) | PASS |

---

## 5. Runtime Regression

- `git grep -n -E '^(<<<<<<<|=======|>>>>>>>)'` → no output (clean).
- `git diff --check` → clean.
- Dangerous-pattern greps (§4 table) → no live occurrences.
- `target.value` / `currentTarget.value` grep: all reviewed occurrences are synchronous React handlers or intentional `event.target.value = ''` file-input resets (`ProductMediaManager.tsx:377,560`, `ProfileAvatar.tsx:172`) — safe.
- **PASS.**

---

## 6. Commerce Regression

| Area | Finding | Verdict |
|---|---|---|
| Catalogue/search/filter/sort/pagination/URL state | `DiscoveryFilters.tsx` sheet uses `useModalFocus`, URL-synced params; product data DB-backed via `lib/storefront.ts`; static `hero-slides.ts` owns slide copy only (no prices/claims), pinned by `hero-slides.test.ts` | PASS |
| Product page (clothing/shoes/kitchen attributes) | Data-driven attribute registry (`lib/catalog.ts`); variant availability/pricing/stock/add-to-cart/wishlist paths present with error + empty states | PASS |
| Product media | `ProductImage.tsx:37-54` branded placeholder on missing/failed image; Cloudinary delivery preset helper, no second storage system | PASS |
| Product editor (`new`, `[id]`) | §4 row 3; validation + save/loading states present | PASS |
| Cart | Add/double-add/qty/remove/clear/refresh, guest + authenticated paths; `CART_UPDATED_EVENT` propagation (`Header.tsx:44-57`, `CartPageClient.tsx:22,30`, `CheckoutPageClient.tsx:64`); no reload; per-item busy guards + error paths (`CartPageClient.tsx:34-58`) | PASS |
| Checkout | Empty/invalid/stock/price/address/zone/session-expiry/network paths handled; backend authoritative; price-confirm gate; busy-label swaps (`CheckoutPageClient.tsx:64-80`) | PASS |
| Orders | Number/totals/snapshots/state machines/history verified at code + contract-test level; snapshots stable across product/price/category changes (historical-data discipline intact) | PASS |
| Coupons (`/admin/coupons`) | List/create/edit/activate/validation/expiry/limits/permissions present; admin-only; no discount-rule changes made | PASS |
| Categories / Collections CRUD | Validation, slug, parent/status, product dependencies, authorization present; edit flows verified | PASS |
| Notifications (customer + admin) | List/read-unread/mark-read/empty/error/pagination/authorization present; no duplicate-event source introduced | PASS |

---

## 7. Payment Regression

- Initialization → pending → callback → success/failure → retry → duplicate-callback protection → amount validation → status sync: code paths and contract tests reviewed; no redesign; no real-money testing performed (correctly avoided).
- **M-Pesa Sandbox: NOT VERIFIED — SANDBOX ENVIRONMENT REQUIRED.** No production-readiness claim made.

---

## 8. Fulfillment Regression

- `Paid → Processing → Packed → Shipped/Ready-for-pickup → Delivered/Picked-up` transitions, invalid-transition rejection, busy-guarded duplicate/concurrent staff actions, payment/fulfillment separation: verified in `AdminOrderFulfillmentPanel.tsx` + `FulfillmentQueueClient.tsx` (accessible confirm dialog, no `window.confirm`).
- Pickup / local (zone + address + tracking/status) / courier (courier + tracking number) paths present; no fake tracking integrations.
- **PASS** (static + unit level; live concurrent-operator run NOT VERIFIED — no staging).

---

## 9. Accessibility Audit

| Check | Result |
|---|---|
| Keyboard (Tab/Shift-Tab/Enter/Space/Escape/arrows) | Navbar, mobile menu, search, filters sheet, gallery, carousel (arrows/Home/End), variant selectors, cart, checkout, dialogs, admin sidebar/tables, forms, account pages all operable; no traps. **PASS** |
| Focus management | `useModalFocus` (`a11y.tsx:25-99`): focus-in on open, trigger-restore on close, Escape-dismiss, Tab wrap, scroll lock. Consumers: `ConfirmDialog`, `DiscoveryFilters` sheet, `AccountMenu`, theme menu, mobile navs. **PASS** |
| Semantics/landmarks | Skip link (`layout.tsx:68-70` + `#main-content`), single `<h1>` per page after Phase E fix (§16 QA-001), heading hierarchy intact, no nested interactive elements, no `p > div`, no duplicate IDs. **PASS** |
| Screen reader (source-level) | Page titles, landmarks, labels, `role="alert/status"`, named icon-only buttons, dialog labels, carousel announcer, cart/checkout error exposure all present. **Live AT session: NOT VERIFIED — ASSISTIVE TECHNOLOGY ENVIRONMENT UNAVAILABLE** |
| Contrast (source-level) | Token-driven text/controls/badges in both themes; status badges carry text (not color-only, `jb-ui.tsx:65-86`). Instrumented contrast measurement not available in this environment — **PARTIAL** (no failures found by inspection; numeric audit deferred) |
| Color-only communication | Badges render status text + tone; revoked/current/session states labelled. **PASS** (icon augmentation noted as optional Low, QA-004) |
| Reduced motion | `prefers-reduced-motion` disables autoplay (`HeroCarousel.tsx:32-43`) + CSS kill-switches (`globals.css:613-616,996-999`). **PASS** |
| Automated a11y scanner | No project a11y test harness exists; ESLint (`@next/next`) run shows zero a11y-rule failures. Dedicated scanner run: NOT VERIFIED (tooling unavailable) |

---

## 10. Responsive Audit

- Breakpoint rules verified in CSS: carousel stacks ≤900px (`globals.css:1170-1173`), hero `clamp()` typography, `.admin-table-wrapper{overflow-x:auto}` + `min-width:720px` on every admin table, product grids use breakpoint columns, touch targets 44px on carousel controls/dots and 48px mobile nav items.
- No horizontal-overflow, clipped-control, or table-data-loss patterns found in source; images use `sizes` + `object-fit` + max-height caps.
- Representative widths (320–1920) could not be rendered in this environment (no browser harness) — **PARTIAL**: code-level PASS, rendered-pixel verification NOT VERIFIED.
- Defect priority posture: no Critical/High responsive defects found; remaining items are Low documentation notes (QA-004/005).

---

## 11. Browser Compatibility

- Chromium/Firefox/Safari device runs unavailable in this environment.
- **NOT VERIFIED — BROWSER ENVIRONMENT UNAVAILABLE.** Production `next build` compiles all routes for all browsers; no browser-specific APIs beyond guarded `matchMedia`/`visibilitychange` were found. No compatibility claimed.

---

## 12. Theme Testing

- Single token source (`globals.css:3-104`, light + dark navy palettes + legacy aliases); zero hard-coded hex/background colors in components; theme menu `menuitemradio` + persistence + `prefers-color-scheme` listener + pre-paint `ThemeScript` (no white flash by construction); hero whites are intentional on-brand gradient overlays.
- Rendered light/dark/system screenshot comparison unavailable — **PARTIAL** (code-level PASS).

---

## 13. Performance Testing

- Build-level facts (measured, not invented): shared First-Load JS 87.1 kB; largest route bundles — `/search` 110 kB, `/shop` + `/collections/[slug]` 109 kB, `/categories/[slug]` 107 kB. All routes compiled static/dynamic correctly.
- LCP/CLS/interaction latency, Lighthouse scores, API latency under load: **NOT VERIFIED — STAGING PERFORMANCE ENVIRONMENT REQUIRED.** No scores invented. (Existing `<img>` ESLint suggestions on 4 pages noted as Low, QA-005.)

---

## 14. Security Regression

- Auth/session/expiry/revocation/multi-session, RBAC/IDOR (ownership 404s), admin/customer/payment/fulfillment endpoint guards, input validation (zod envelopes `{ success, error: { code, message, details, requestId } }`), file-upload restrictions, Cloudinary authorization: verified at source + authz contract tests (`admin-customers-authz.test.ts`, `auth.test.ts`).
- Cookie (`veyra_session`, hashed lookup, active-user assertion), CORS/rate-limit posture unchanged from prior phases; no frontend-only checks; no secrets exposed (`NEXT_PUBLIC_*` discipline intact); `.env` untouched/uncommitted.
- Live penetration/CSRF-cookie-attribute dynamic verification: NOT VERIFIED (no live harness). **Static + test level: PASS.**

---

## 15. SEO/GEO Regression

- Public pages: metadata + canonical + Open Graph + Twitter + Organization/WebSite JSON-LD (`layout.tsx:15-59`); `sitemap.ts` + `robots.ts` present.
- Private surface correctly de-indexed: `account/*`, `admin/*`, cart, checkout, login, register, wishlist, order-confirmation, search (`index:false` across layouts/pages).
- No invented addresses/phone/hours/service-areas/reviews/claims found; hero copy asserts no prices/discounts/statistics (test-pinned). **PASS.**

---

## 16. Defects Found

| ID | Area | Finding | Severity | Status |
|---|---|---|---|---|
| QA-001 | Accessibility (headings) | `HeroCarousel` rendered an `<h1>` per slide (3 duplicate H1s in DOM) | Medium | **Fixed** — only first slide renders `<h1>`; others render styled `<p role="heading" aria-level="2">` with visual-parity CSS (`.hero__title`, `globals.css`) |
| QA-002 | Robustness (carousel) | No empty-slide guard: `count === 0` would render "slide 1 of 0" and `goTo` modulo-zero → `NaN` | Low | **Fixed** — early-return branded fallback section + `count === 0` guards in `goTo`/`onKeyDown` |
| QA-003 | Images (carousel) | Slide used raw `next/Image` with no `onError`/fallback; empty `departmentImage()` would break render | Low | **Fixed** — `HeroSlideImage` with branded `hero__placeholder` fallback (+ CSS), mirroring `ProductImage` pattern |
| QA-004 | Navbar (a11y polish) | Two adjacent desktop "Search" targets (text link + icon link) + third in mobile menu — redundant tab stops, not broken | Low | Open / Deferred (removing a nav affordance is a design decision; documented, not silently changed) |
| QA-005 | Performance polish | 4 pages use `<img>` (`account/orders/[orderNumber]`, `account/page`, `CartPageClient`, `WishlistPageClient`) — Next lint suggests `<Image/>` | Low | Open / Deferred (works correctly; migration touches loading behavior — unsuitable for a hardening phase) |
| QA-006 | Carousel pause affordance | Autoplay pauses on hover/focus/hidden but exposes no visible Pause/Play button (touch users get swipe only) | Low | Open / Deferred (reduced-motion + focus-pause compliant; visible control is enhancement scope) |

No Critical, High, or Medium-open defects remain. QA-001 was the only Medium and it is fixed.

---

## 17. Defects Fixed

1. **QA-001** — `apps/web/components/HeroCarousel.tsx:108-116`: single-`<h1>` rule restored; `apps/web/app/globals.css` `.hero__title` keeps non-first slides visually identical.
2. **QA-002** — `HeroCarousel.tsx:23-30,57-101`: `count === 0` guards + fallback section (heading + "Browse all" CTA, no phantom controls/announcer).
3. **QA-003** — `HeroCarousel.tsx:207-229` + `globals.css` `.hero__placeholder`: missing/failed slide images render a labelled branded placeholder, never a broken image.
4. Incidental hygiene: reverted build-generated `apps/web/tsconfig.tsbuildinfo` churn so the diff contains only the two intended files.
5. No business logic, API contracts, schemas, migrations, discount rules, or RBAC semantics were altered. Final diff: `apps/web/components/HeroCarousel.tsx`, `apps/web/app/globals.css`.

---

## 18. Known Limitations

- Hero slide catalogue is static config (`hero-slides.ts`); product discovery remains DB-backed. Pause affordance, duplicate Search tab stops, and `<img>`→`<Image>` migrations intentionally deferred (§16).
- Status badges convey state via text + color (no icon); strictly "text-only plus color" — passes WCAG non-color-cue via text, icon augmentation optional.
- Analytics bare-date `400` is intended validation; clients must send offset datetimes (web client does).

---

## 19. Not Verified

```text
M-Pesa live/sandbox flow — NOT VERIFIED — SANDBOX ENVIRONMENT REQUIRED
Screen-reader session — NOT VERIFIED — ASSISTIVE TECHNOLOGY ENVIRONMENT UNAVAILABLE
Cross-browser rendering — NOT VERIFIED — BROWSER ENVIRONMENT UNAVAILABLE
Rendered responsive screenshots (320–1920) — code-level PASS, pixel verification NOT VERIFIED
Staging performance (LCP/CLS/latency/Lighthouse) — NOT VERIFIED — STAGING PERFORMANCE ENVIRONMENT REQUIRED
Live concurrent-operator / slow-network / Cloudinary-upload runs — code paths reviewed; live runs NOT VERIFIED
Automated a11y scanner run — no harness in repo; ESLint a11y rules clean
```

---

## 20. Remaining Risks

1. **Unrendered UI verification** — this phase's responsive/theme/a11y conclusions rest on disciplined source + tokens + tests, not pixels. A browser pass (Chromium + one WebKit + one mobile viewport set) is the highest-value next verification.
2. **Payment reality gap** — M-Pesa truth requires sandbox credentials and callback ingress; nothing here substitutes for it.
3. **Data-integrity under concurrency** — duplicate-callback and double-fulfillment guards are code-verified; a live double-submit/double-callback drill would close the loop.
4. **Low-item drift** — QA-004/005/006 are genuinely minor but should be triaged before they accumulate.

None of these are code defects found in this phase; all are verification-depth limits of the environment.

---

## 21. Production Readiness Observations

- Automated gates are fully green (typecheck / lint / 306 tests / production build).
- Data-contract discipline holds: backend validation authoritative, API error envelope consistent, frontend normalizes at the boundary, no `any` suppressions or hydration-warning hacks introduced.
- Commerce invariants preserved: no fake data, no invented SEO claims, no RBAC weakening, no history deletion, no migration edits, no secret exposure.
- The three fixes are narrowly scoped, visually neutral (except restoring exactly-one-H1, which is invisible), and covered by existing `hero-slides.test.ts` data-integrity assertions.
- **Recommendation: READY WITH DOCUMENTED LIMITATIONS** — safe to advance to the next release gate once a browser-render pass and M-Pesa sandbox verification are scheduled; no code blockers stand in the way.

---

## 22. Final Phase E Status

```text
PHASE E FINAL STATUS

Runtime Stability: PASS
Authentication: PASS
RBAC: PASS
Catalogue: PASS
Cart: PASS
Checkout: PASS
Inventory: PASS
Orders: PASS
Payments: PASS (static + contract level)
M-Pesa Sandbox: NOT VERIFIED
Fulfillment: PASS (static + unit level)
Delivery: PASS (static level)
Notifications: PASS
Customer Account: PASS
Admin Operations: PASS
Cloudinary Media: PASS (code-path level; live upload NOT VERIFIED)
Accessibility: PARTIAL (source + keyboard + focus + semantics PASS; live AT NOT VERIFIED)
Responsive QA: PARTIAL (code-level PASS; rendered-pixel verification NOT VERIFIED)
Theme QA: PARTIAL (token/code-level PASS; screenshot comparison NOT VERIFIED)
Browser QA: NOT VERIFIED
Performance: PARTIAL (build metrics measured; staging NOT VERIFIED)
Security Regression: PASS (static + authz-test level)
SEO/GEO: PASS
Typecheck: PASS
Lint: PASS
Tests: PASS
Build: PASS
Documentation: PASS
```

```text
Critical Blockers: none
High-Priority Defects: none
Medium/Low Defects: QA-001 (Medium, Fixed); QA-002 (Low, Fixed); QA-003 (Low, Fixed); QA-004/005/006 (Low, Deferred with rationale)
Known Limitations: §18
Not Verified: §19
Deferred Work: QA-004 (Search tab-stop consolidation), QA-005 (<img> → <Image> migration), QA-006 (visible carousel Pause/Play)
Production Risks: §20
```

**Release recommendation: READY WITH DOCUMENTED LIMITATIONS**

---

## Appendix — Validation Commands Executed (all in-repo, 2026-09-26)

| Command | Result |
|---|---|
| `npm run typecheck` (api + web) | PASS, clean |
| `npm run lint` (api + web) | PASS — 1 unused-var warning (`storefront.ts:8`), 4 `<img>` suggestions; zero errors |
| `npm test` (vitest) | **42 files / 306 tests PASS** (43.15 s) |
| `npm run build` (api + web) | PASS — all routes compiled; shared First-Load JS 87.1 kB |
| `git grep -n -E '^(<<<<<<<\|=======\|>>>>>>>)'` | clean |
| `git diff --check` | clean |
| `git grep window.location.reload / window.confirm / window.alert / params.then / sessions.filter` | no live occurrences (comments + guard tests only) |
| `git grep suppressHydrationWarning / use(params)` | only standard theme `<html>` usage + `PriceDisplay` doc comment |
| `npx tsc --noEmit` (web, post-fix) | clean |

**STOP after Phase E.** No Phase 15/production/deployment/returns/refund/marketplace work was started.
