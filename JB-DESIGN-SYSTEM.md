# JB Mercantile Design System v2

Brand: **JB Mercantile** — *Fashion • Footwear • Kitchen & Home*. Premium multi-category Kenyan retail. Royal Blue + White, Light/Dark/System. Single token source: `apps/web/app/globals.css`.

## 1. Brand colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `--jb-primary` | `#1D4ED8` | `#3F6FE0` | Primary CTA bg (white text both themes) |
| `--jb-primary-hover` / `-active` | `#1E40AF` / `#1E3A8A` | `#3A67DC` / `#2E53B4` | Hover/active (dark values keep 4.5:1 with white) |
| `--jb-primary-strong` | `#0047AB` | `#9DBCFF` | Text/link accents on surfaces |
| `--jb-primary-soft` | `#E8EEFB` | `#17264D` | Tinted wells, selected states |
| `--jb-primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on primary |

Royal Blue `#0047AB` (classic) is the text-accent shade; `#1D4ED8` is the action shade (better AA on white). Never use other hues for brand.

## 2. Semantic tokens (both themes)

```text
--background / --foreground            app canvas + ink
--surface / --surface-elevated / --surface-muted
--border / --border-strong
--primary / --primary-foreground
--muted / --muted-foreground           secondary text (#4B5B7C light / #A9B7D6 dark)
--success / --warning / --error / --info (+ -bg tints)
--focus                                visible focus ring, never removed
```

Dark surfaces: `#0B1222` canvas, `#121B31` cards, `#1A2542` wells — deep navy, never pure black; hero stays royal-blue gradient (deeper stops in dark). `color-scheme` set per theme so native controls match.

## 3. Typography

One system sans stack. Display `clamp(2.25rem,5vw,3.75rem)/1.05/700`; page `clamp(1.6rem,2.4vw,2.25rem)`; section `clamp(1.5rem,2vw,2.2rem)`; card `1.05–1.2rem`; body `1rem/1.6`; small `0.875rem`; eyebrow `0.72rem/uppercase/0.14em/700`. Readable in both themes (ink `#0F1E3D` / `#EAF0FF`).

## 4. Spacing / radii / shadows / borders / breakpoints

Scale `0.25–4rem`; container `min(1180px,100%-2rem)`; radii sm 10 / md 14 / lg 18 / pill 999 (no excessive rounding); shadows subtle only (stronger black in dark); borders `1px var(--border)`. Breakpoints: 1020px (filters→drawer, mega-menu off), 900px (grids 2-col, nav→hamburger), 640px (single column).

## 5. Buttons / inputs / badges / chips

Primary (blue), Secondary + Danger (surface bg, colored border/text), Small, Link/text-button. 44px targets, hover/active/focus-visible/disabled/loading. Inputs 44–48px, 10px radius, blue focus ring + tint; error red + message. Badges pill uppercase (sale blue; status green/red/amber/blue via `StatusBadge`). Active-filter `.chip`s with removable ✕.

## 6. Navigation / breadcrumbs / pagination / menus

Header: logo, Shop mega-menu (departments → categories, Escape/outside-click close), department links, search/account/wishlist/cart with count badges, theme dropdown (Light/Dark/System, `menuitemradio`). Mobile drawer with native `<details>` department expanders + appearance control. Breadcrumbs `nav > ol` + `aria-current`. Pagination prev/next + live count. Footer: 4 columns (brand, departments, collections, support).

## 7. Product components

`JBProductCard`: media 4:5 + hover image + `-x%` sale badge, dept · category eyebrow, name, desc, KES price, stock + option count, wishlist action; image-failure fallback (never broken). `ProductGallery`: main + selectable thumbnails + fallback. `ProductSpecifications`: schema-driven `dl` table (apparel and appliance facts, same component). Attribute controls: Color→swatch (hex map + initial fallback), Size/Shoe Size/Capacity/Power→option buttons, Material/Style→checkboxes — driven by `ATTRIBUTE_REGISTRY`, invalid combos unselectable.

## 8. Discovery

URL-driven state (`department/category/q/sort/attrs/inStock/maxPrice/page`), shareable. Desktop sticky sidebar `FilterPanel`; mobile bottom `Sheet`; `SortControl`; active chips; facets derived per-scope (≥2 values, Brand suppressed when single); data-driven price buckets; 12/page pagination. Search: suggestions (departments/categories/products), combobox keyboard (↑↓/Enter/Escape), clear button, distinct start vs no-result empties.

## 9. States / dialogs / toasts / tables / forms / tabs

Loading: skeletons matching layout (`aria-busy`). Empty: explanation + next-action CTA (per surface). Error: message + retry, no internals. Success: confirmation + toast. Dialogs (filter sheet): overlay, labelled, focus-visible, Escape/outside close. Toasts: bottom-center, success/error/info, icon-independent text, `aria-live=polite`, 4s. Tables: sticky muted header, row hover, scroll container, themed. Forms: label/help/error/`aria-invalid`, 20px+ checks with blue accent, toggle switches with focus rings.

## 10. Accessibility rules

WCAG 2.2 AA: AA pairs both themes; 44px targets; visible focus; semantic landmarks/headings; live regions; labelled controls; no color-only state (labels + text accompany badges/swatches); `prefers-reduced-motion` kills transitions/zoom; skip link; duplicate-ID-free filter instances (`idPrefix`).

## 11. Logo

`JBLogo`/`JBMark` SVG: royal rounded square + white geometric JB, theme-proof. Lockup with `JB MERCANTILE` + optional descriptor. PNGs remain for favicon/social/packaging.
