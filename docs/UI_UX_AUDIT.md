# UI/UX Audit — Tailwind-first pass (2026-10-08)

## Scope note (domain mismatch — REQUIRES READING)

The transformation brief describes a **services marketplace** (providers, bookings, availability, earnings, commissions, loyalty). This repository is **JB Mercantile: single-store D2C retail** (Fashion • Footwear • Kitchen & Home; no vendors/marketplace per AGENTS.md). There are no provider/booking/service/commission/loyalty tables, endpoints, or pages to restyle. Building `ProviderCard`/`BookingFlow`/`EarningsCard` UIs would invent business data and violate hard rules. All marketplace-service sections of the brief (§15–29 customer/provider booking journeys) are therefore **NOT APPLICABLE**; the Tailwind work below maps to the real retail equivalents (ProductCard, discovery, cart/checkout, M-Pesa states, account, admin ops).

## 1. Frontend architecture (verified)

- Next.js 14.2.15 App Router, React 18, TypeScript, `typedRoutes`. Server components for catalogue/discovery; client islands for cart/checkout/wishlist/account/admin.
- Fetch clients: `lib/shopping-api.ts`, `lib/admin-api.ts`, `lib/analytics-api.ts` (`credentials:include` → `NEXT_PUBLIC_API_URL`).
- No component library, no shadcn, no Storybook. Shared primitives: `components/jb-ui.tsx` (PageHeader/EmptyState/ErrorState/LoadingSkeleton/StatusBadge), `JBLoading.tsx`, `ConfirmDialog.tsx`, `JBIcons.tsx` (30 SVG icons), `a11y.tsx` (`useModalFocus`), `Toast.tsx`.

## 2. Styling architecture (verified — root cause of this pass)

- `tailwindcss@3.4.10` + `autoprefixer` + `postcss` in devDeps but **completely unwired**: no `tailwind.config`, no `postcss.config`, no `@tailwind` directives. Confirmed by glob (0 configs) + grep (0 directives).
- Single 1710-line hand-written `app/globals.css` with BEM-ish classes and a mature `--jb-*` + semantic token layer (light + hand-designed dark navy theme). Design docs: `JB-DESIGN-SYSTEM.md` (v2), `JB-UIUX-AUDIT.md`, `JB-UIUX-IMPLEMENTATION-REPORT.md`, `JB-UIUX-FINAL-SIGNOFF.md`.
- ~100 `style={{}}` occurrences (grep): majority legitimate dynamic values (progress widths, swatch hex, skeleton geometry, chart SVG); minority static margins/paddings that should become utilities over time.
- `window.confirm`/`alert`: NONE (migrated to `JBConfirmDialog`). Emoji UI icons: NONE (migrated to `JBIcon`).

## 3. Improvements made (this pass)

- `apps/web/tailwind.config.ts` (new): content globs, `darkMode: [class, [data-theme=dark]]`, `preflight: false` (existing base owns resets), theme mapped to CSS vars (colors/radius/shadow/font/container).
- `apps/web/postcss.config.mjs` (new): tailwindcss + autoprefixer.
- `app/globals.css`: `@tailwind base/components/utilities` prepended with coexistence comment; zero existing rules touched.
- `lib/cn.ts` (new): zero-dep composition primitive with `tailwind-merge` upgrade path documented.
- `components/ui/button.tsx|badge.tsx|card.tsx` (new): Tailwind-first, token-driven, variant-based pilot matching existing `.button`/`.status-badge` visuals; `motion-reduce`, focus rings, 44px targets.
- `docs/DESIGN_SYSTEM.md` (new), this file (new).

## 4. Remaining issues

- Existing pages still use legacy CSS classes (by design — incremental migration, one surface at a time; no bulk rewrite in this pass).
- Static `style={{margin…}}` instances could move to utilities during surface migrations.
- No live device/AT pass in this environment (same limitation as prior sign-off). Manual mobile (320–430px), tablet, desktop + screen-reader verification still recommended.
- `clsx`/`tailwind-merge`/`cva` not added (no new JS weight per storefront perf decision); `cn()` signature is merge-compatible when needed.

## 5. Component migration status

| Primitive | Legacy | Tailwind-first | Status |
|---|---|---|---|
| Button | `.button` CSS | `UIButton` | PILOT (additive) |
| Badge/Status | `.status-badge` + inline tone | `UIBadge`/`UIStatusBadge` | PILOT (additive) |
| Card | bespoke per page | `UICard` | PILOT (additive) |
| Dialog/Drawer/Sheet/Toast/Skeleton/Empty/Error | `ConfirmDialog`, `JBLoading`, `jb-ui` states | reuse existing (already accessible) | KEEP — no duplicate system |
| Provider/Booking/Service/Earnings domain | — | — | NOT APPLICABLE (no backend) |
