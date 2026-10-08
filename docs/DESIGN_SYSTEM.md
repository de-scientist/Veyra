# JB Mercantile Design System (Tailwind-first)

Status: IMPLEMENTED (foundation) — `apps/web/tailwind.config.ts` + `postcss.config.mjs` + `app/globals.css` directives + `components/ui/*` + `lib/cn.ts`.

Single token source: `apps/web/app/globals.css` (`--jb-*` + semantic aliases). Tailwind maps to those vars — never a second hex palette.

## Tokens

| Semantic (Tailwind) | CSS var | Light | Dark |
|---|---|---|---|
| `bg-background` / `text-foreground` | `--background` / `--foreground` | `#ffffff` / `#0F1E3D` | `#0B1222` / `#EAF0FF` |
| `bg-card` | `--surface` | `#ffffff` | `#121B31` |
| `bg-popover` | `--surface-elevated` | `#ffffff` | `#182441` |
| `bg-secondary` / `bg-muted` | `--surface-muted` | `#F1F5FD` | `#1A2542` |
| `bg-primary` / `text-primary-foreground` | `--primary` | `#1D4ED8` / `#fff` | `#3F6FE0` / `#fff` |
| `border-border` / `border-input` | `--border` | `#DCE3F5` | `#26345A` |
| `ring` | `--focus` | `#1D4ED8` | `#9DBCFF` |
| `success` / `warning` / `destructive` / `info` | `--success` etc. | light tints | dark tints |

Dark mode: `[data-theme="dark"]` (class strategy). Hand-designed navy, not inverted.

## Typography

System sans stack; page `clamp(1.6rem,2.4vw,2.25rem)`; section `clamp(1.5rem,2vw,2.2rem)`; body `1rem/1.6`; small `0.875rem`; eyebrow `0.72rem/uppercase/0.14em/700`. Hierarchy via existing `.eyebrow`/heading classes + Tailwind sizes — no oversized display heads.

## Spacing / radius / shadow

- Spacing: Tailwind scale; page sections `py-8/12`; container `max-w-container mx-auto px-4` (`1180px`).
- Radius: `rounded-sm/md/lg` → 10/14/18px; `rounded-pill` → 999px. Cards `lg`, inputs `sm`, badges/chips `pill`.
- Shadow: `shadow-sm/md` only; borders carry hierarchy, not floating cards.

## Motion

`transition-colors` + `motion-reduce:transition-none` on interactive primitives. `prefers-reduced-motion` reset lives in globals.css (kills transitions/zoom, keeps feedback).

## Breakpoints

Tailwind defaults for utilities; JB custom breakpoints stay as CSS media queries in globals.css: 1020px (filters→drawer, mega-menu off), 900px (2-col, hamburger), 640px (single column).

## Component conventions

- `cn()` (`lib/cn.ts`) is the only composition primitive. Variants as `Record<Variant, string>`, never `BlueButton`-style duplicates.
- New code: `<UIButton variant size>`, `<UIBadge tone>`, `<UICard>` from `components/ui/`. Legacy `.button`/`.status-badge`/`.empty-state` CSS remains for existing pages until migrated one surface at a time.
- Arbitrary values (`bg-[#123456]`, `mt-[13px]`) forbidden when a token exists. `style={{}}` only for genuinely dynamic values (progress widths, swatch hex, image aspect).
- Opacity modifiers on var-colors don't work — use tint tokens (`--jb-*-bg`) or `color-mix()`.

## Usage

```tsx
import { UIButton } from "@/components/ui/button";
import { UICard, UICardBody } from "@/components/ui/card";
import { UIStatusBadge } from "@/components/ui/badge";

<UICard><UICardBody>
  <UIStatusBadge status={order.status} />
  <UIButton variant="primary" size="md">Checkout</UIButton>
</UICardBody></UICard>
```

## Accessibility

44px targets, `:focus-visible` ring (`--focus`), semantic landmarks, live regions on toasts/status, `aria-busy` skeletons, no color-only state, reduced-motion support. Target WCAG 2.2 AA.
