# JB — UI/UX Audit (Veyra baseline, 2026-09-19)

## 1. Current System

- **Architecture:** npm-workspaces monorepo (`veyra-commerce`). `apps/web` = Next.js 14.2.15 App Router (React 18, no Tailwind utility usage — single hand-written `app/globals.css`, ~1200 lines). `apps/api` = Fastify 4 + Prisma + Zod. `packages/{config,types,validation}` shared. No component library, no shadcn/ui, no Tailwind config file (dependency present but unused), no design tokens, no storybook.
- **Frontend framework:** Next.js App Router with `typedRoutes`. Mostly server components for catalogue; client components (`'use client'`) for cart, checkout, wishlist, returns, account, admin. Data via `lib/shopping-api.ts`, `lib/admin-api.ts`, `lib/analytics-api.ts` (fetch + `credentials:include` to `NEXT_PUBLIC_API_URL`).
- **Component architecture:** ad-hoc per-page components in `components/` + `app/**`. No shared Button/Input/Modal/Table primitives. `components/admin.tsx` holds the only shared admin primitives (badge, stat card, pagination, empty state, confirm). Duplicated patterns everywhere (empty-state divs, inline error `<p>`, `window.confirm` for destructive actions).
- **Styling architecture:** one global CSS file with BEM-ish classes (`.product-card`, `.checkout-section`, `.account-nav`, `.admin-table`). Colours hard-coded via `:root` vars: `--bg:#f5f1eb` (warm beige), `--surface:#fffdf9`, `--brand:#1f2937` (charcoal), `--accent:#7c5a45` (brown), `--brand-soft:#efe4d4`. No semantic tokens for success/warning/error/info, no focus-ring token, no spacing/radius/shadow scale.
- **Existing branding:** Veyra earth-tone fashion brand (beige/brown/charcoal, Arial, letterspaced `VEYRA` wordmark). No logo asset integrated; `public/jb-logo.png` + `public/jb-navbar.png` exist in repo (commit `b8a16ea`) but are **not referenced anywhere**.
- **Current UX problems:** (a) warm beige theme unrelated to JB Royal Blue + White; (b) header has no logo, no mobile menu (`main-nav` hidden <900px with no replacement — mobile users lose Shop/Category nav); (c) footer items are plain text, not links; (d) no login/register/forgot-password pages at all (admin guard redirects to `/`); (e) search/shop/category/collection pages are minimal (no filters, sorting, pagination, mobile drawer); (f) product page lacks breadcrumbs styling/thumbnails/quantity a11y; (g) checkout is single long form; M-Pesa states exist but payment-status polling UX is weak; (h) loading states are plain text ("Loading..."), no skeletons; (i) destructive admin actions use native `window.confirm`; (j) emoji icons used as the sole icon system in account/admin nav (inconsistent, screen-reader noisy); (k) tables force 720px min-width with raw horizontal scroll.

## 2. Screen Inventory

| Area | Route/Screen | Current State | UX Issues | Redesign Required |
|---|---|---|---|---|
| Shell | `app/layout.tsx` + Header/Footer | Beige sticky header, text wordmark, footer dead text | No logo, no mobile nav, dead footer links, Veyra titles/meta | YES — JB shell |
| Home | `/` | Hero + category grid + featured + promo + new arrivals | Beige gradient hero, no trust row, promo cards text-only | YES |
| Shop | `/shop` | Static grid, count, back-home | No filter/sort/pagination/drawer | YES |
| Category | `/categories/[slug]` | Same pattern as shop (static) | No breadcrumbs/SEO desc/sort | YES |
| Collection | `/collections/[slug]` | Same pattern | Same as category | YES |
| Search | `/search` | Input + static filter | No count/filters/empty vs no-result distinction | YES |
| Product | `/products/[slug]` | Gallery grid + summary + actions + related | No thumbnails, variant UX basic, no stock/quantity clarity | YES |
| Cart | `/cart` | Client list + summary | Veyra copy, plain loading, no skeleton | YES (copy + states) |
| Wishlist | `/wishlist`, `/account/wishlist` | Client grid | No move-to-cart consistency | YES |
| Checkout | `/checkout` | Client 3-section form + summary | Long form, weak step clarity, no trust header | YES |
| Payment | M-Pesa initiate/status (in checkout + confirmation) | Backend-driven, UI text only | Must never show success on STK-send; needs explicit pending/success/fail/timeout/retry | YES (states) |
| Confirmation | `/order-confirmation/[orderNumber]` | Summary card | Veyra title, needs JB brand + next steps | YES |
| Auth | login/register/forgot/reset/verify — **MISSING** | No routes; API `POST /auth/*` exists | Critical gap: users cannot sign in via UI | YES — create JB auth pages |
| Account shell | `/account/*` layout + AccountNav | Sidebar 260px + mobile drawer, emoji icons | Emoji icons, no focus style, usable structure — keep IA | YES (visual + icons) |
| Account | dashboard, profile, addresses, orders, order detail, tracking, payments, returns (+detail), refunds, wishlist, notifications, security, preferences | Functional, real API data, good IA | Beige cards, inconsistent headers, text loading states | YES (theme + states) |
| Returns public | `/returns` | Request flow + history | "calculated by Veyra" copy; usable — keep logic | YES (copy + theme) |
| Admin shell | `/admin` AdminShell | Sidebar + role badge + mobile drawer | `VEYRA OPS` brand, emoji icons, text loading | YES — JB Ops shell |
| Admin | dashboard, products (+new, +[id]), inventory (+movements), orders (+detail), payments, fulfillment, returns, customers (+detail), reviews, coupons, notifications, audit-logs, settings, analytics (8 sub-pages) | Real backend data, deep-linked stat cards, tables | Beige theme, raw tables, `window.confirm`, text states, no skeletons | YES (theme + tables + dialogs + states) |
| System | `not-found.tsx`, `robots.ts`, `sitemap.ts` | Basic 404, correct robots, static sitemap | Veyra placeholder domain default | YES (copy + brand) |

## 3. Component Inventory

Buttons: `.button` (pill, charcoal) + `.button--secondary`; `.text-button`; danger class referenced but undefined. No sizes/loading/focus variants. Inputs: only checkout/return forms styled; no global input/select/checkbox/radio/switch style. Cards: product/category/promo/cart/summary all bespoke. Tables: `.admin-table` only. Tabs: none standard. Badges: `.badge` + inline-style `AdminStatusBadge` (hard-coded hex). Alerts: `.inline-message` (brown) / `.success-message` (green) only. Dialogs/drawers/dropdowns: none (account/admin drawers are custom CSS). Navigation/breadcrumbs/pagination: bespoke, pagination only admin. Product card/gallery/price: `ProductCard`, `PriceDisplay`, `ProductActions` — good base, needs JB theme + a11y. Timelines: delivery/return history bespoke. Charts: `analytics.tsx` (keep, re-theme). Forms: no FormField primitive; React Hook Form present in deps but unused in these pages (controlled state instead — keep, don't rewrite). Notifications/toasts: none global (per-page messages). Loading/empty/error: plain-text divs, no skeletons.

## 4. Brand Audit (user-facing `Veyra` occurrences)

`app/layout.tsx` (title/meta/URL default), `components/Header.tsx` (wordmark + aria), `components/Footer.tsx`, `components/CartPageClient.tsx` (empty-cart copy), `components/ReturnsClient.tsx` ("calculated by Veyra"), `lib/storefront-data.ts` (6× `brand:'Veyra'`), `app/*/page.tsx` titles (`wishlist`, `returns`, `order-confirmation`, `account/layout`), `app/sitemap.ts` default domain, `app/admin/AdminShell.tsx` (`VEYRA OPS`). Internal/legitimate (DO NOT rename): npm workspaces `@veyra/*`, `veyra_session`/`veyra_guest_cart` cookies, `veyra-postgres`/`veyra_dev` DB, `service:'veyra-api'`, `admin@veyra.local` seed, `veyra.example.com` placeholder default (replace default with JB default, keep env override), docs/PHASE reports (historical — leave).

## 5. Accessibility Audit

- Contrast: brown `--accent #7c5a45` on beige fails in small text; muted `#5f5a55` on `#f5f1eb` ~4.1:1 borderline; charcoal buttons pass but focus ring absent (global `:focus-visible` missing — keyboard users get browser default only).
- Keyboard: variant pills are real buttons (good) but `role=listbox` without arrow-key support; drawers lack focus trap/Escape; `window.confirm` is keyboard-hostile; mobile nav toggle exists but header has no mobile menu at all.
- Labels: checkout/return inputs use wrapping `<label>` (acceptable) but quantity inputs lack visible error text; icon-only emoji links (`🔔`) rely on aria-label (present in header, missing elsewhere).
- Semantic HTML: reasonable (`header/nav/main/footer`, headings); account/admin headers skip levels (`h1`→`h3` in cards); breadcrumbs lack `ol/li`; tables lack `scope`/captions.
- Screen reader: emoji icons announced unless `aria-hidden` (inconsistent); status messages use `role=status/alert` in places (good) but loading states have no `aria-busy`/live region.
- Touch targets: header links ~text-size (<44px); variant pills/quantity inputs small on mobile; admin row actions cramped.

## 6. Responsive Audit

- ≤900px: grids collapse to 2-col (good) but `main-nav` disappears with no hamburger (nav loss); account/admin sidebars become drawers (good pattern, needs focus/Escape polish); cart/checkout stack (good).
- ≤640px: single column (good) but header wraps centered (logo + 5 action links stack awkwardly); cart/wishlist images go full-width tall (wasteful); tables scroll horizontally with no sticky first column; checkout `form-grid` → 1 col (good); hero min-height 320px with huge display type (needs clamp fix).
- No horizontal overflow found by inspection; images use `next/image` with fixed sizes (fine) but no `sizes` attribute.

## 7. UX Recommendations (prioritised)

1. **Navigation:** JB header with logo, hamburger <900px, search/cart/wishlist with count badges; footer with real links; breadcrumbs as `ol`.
2. **Discovery:** shop/category/collection/search share one toolbar pattern (sort + count + mobile filter drawer trigger); keep static-data filtering client-side (no backend change).
3. **Shopping:** single premium `ProductCard`; PDP with thumbnail state, grouped attribute selection, stock/quantity clarity, sticky mobile CTA.
4. **Checkout:** numbered steps (01 Customer, 02 Delivery, 03 Review & Pay), trust strip, authoritative totals only, M-Pesa pending/success/fail/timeout/retry states.
5. **Account/admin:** keep IA + API contracts; re-theme to JB tokens; replace emoji with inline SVG; replace `window.confirm` with accessible dialog; skeleton loading; standardized empty/error/success.
6. **Feedback:** global `.toast`-ready message styles + consistent `EmptyState/ErrorState/LoadingState` primitives.
7. **A11y:** `:focus-visible` ring, 44px targets, label/error association, drawer Escape + focus return, `prefers-reduced-motion`.
8. **Performance:** CSS-only rebrand (no new JS weight); keep server components; `next/image` + existing Unsplash remote pattern; no new fonts from network (system stack).

Backend/API contracts: **no changes required.** All redesigns are presentation-layer; auth pages call existing `POST /auth/login|register` + `GET /auth/me`.
