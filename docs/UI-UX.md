# UI/UX

JB Mercantile brand: Royal Blue + White (`--jb-primary #1D4ED8` light / `#3F6FE0` dark; classic accent `#0047AB`), system sans type scale, radii 10/14/18/pill, container 1180px, breakpoints 1020/900/640. Single token source: `apps/web/app/globals.css`. Full token/component rules: [JB-DESIGN-SYSTEM.md](../JB-DESIGN-SYSTEM.md); rationale: [JB-DESIGN-DECISIONS.md](../JB-DESIGN-DECISIONS.md); sign-off: [JB-UIUX-FINAL-SIGNOFF.md](../JB-UIUX-FINAL-SIGNOFF.md).

## Layout & Navigation

Sticky header (brand, Shop mega-menu, department links, search/sign-in/notifications/wishlist/cart, theme toggle) + mobile drawer with native `<details>` department expanders; 4-column footer; breadcrumbs; pagination. One reusable `ProductCard`, gallery, spec table, and variant picker serve all departments via the attribute registry — no category `if`-branches.

## Discovery UX

URL-driven filters/sort/search/page (shareable, back-button-safe), per-scope facets, price tertiles, combobox search with keyboard support, mobile bottom sheet. See [CATALOGUE.md](CATALOGUE.md).

## Icons

One SVG system (`components/JBIcons.tsx`, 32 icons, 24px grid, 1.8px stroke, `currentColor`): decorative by default (`aria-hidden`), labelled via wrapping controls. Emoji are never interface icons (remaining `→`/`←`/`×` are text content inside labelled links, not icon substitutes).

## Logos

Official assets only — `apps/web/public/jb-logo.png` (full lockup: mark + "JB MERCANTILE SHOP" + tagline) and `apps/web/public/jb-navbar.png` (compact horizontal lockup), both blue-on-white PNGs. `JBLogo` (`full`/`compact`, height-driven, aspect-preserved): header/footer use compact, auth uses full, admin uses full + "JB OPS". Dark mode renders them in a white chip (CSS only — no filters on artwork). Alt: empty inside labelled brand links, `"JB Mercantile"` standalone. Favicon/OG use `jb-logo.png`. No dark variants or icon-only marks exist.

## Dialogs & Drawers

Single focus primitive (`useModalFocus`): scroll-lock, initial focus, Tab trap, Escape close, focus restore. One confirmation dialog (`JBConfirmDialog` + `useConfirm` promise driver): Cancel-first focus, loading guard, inline API errors, `default`/`destructive`/`warning` variants. Toasts (`aria-live=polite`, max 3, 4s). Details in [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Responsive & Motion

Drawers become modal ≤900px; sheets bottom-anchored with internal scroll; tables scroll-contained; `prefers-reduced-motion` disables transitions/zoom while preserving feedback.
