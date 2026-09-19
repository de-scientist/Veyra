# JB Design System v1.0

Brand: **JB** — modern, premium, trustworthy, mobile-first clothing e-commerce (Kenya-first, direct-to-consumer).
Core identity: **Royal Blue + White**. Single token source: `apps/web/app/globals.css :root`.

## 1. Brand

- **Logo:** JB geometric lettermark. Assets: `public/jb-logo.png` (primary, blue-on-white contexts + favicon source), `public/jb-navbar.png` (header-optimised). Usage: header (height 32px desktop / 28px mobile), auth pages (48px), admin sidebar (32px), footer (28px), order-confirmation + emails (where applicable). Clear space = cap-height of "J" on all sides. Never stretch, recolour, add gradients/shadows, or place blue-on-blue.
- **Voice:** concise, trustworthy, no invented claims/prices/reviews/addresses.
- **Principles:** one coherent product; white space first; blue reserved for action/emphasis; subtle motion only; mobile-first; backend authoritative (price, stock, totals, payment state).

## 2. Colour tokens

```text
--jb-primary:            #1D4ED8  (Royal Blue — primary CTA, active nav, links, selected)
--jb-primary-hover:      #1E40AF
--jb-primary-active:     #1E3A8A
--jb-primary-soft:       #E8EEFB  (tinted surfaces, selected pills, info bg)
--jb-primary-foreground: #FFFFFF
--jb-background:         #FFFFFF  (app background)
--jb-surface:            #FFFFFF  (cards)
--jb-surface-muted:      #F1F5FD  (subtle wells, media placeholders, summary strips)
--jb-text:               #0F1E3D  (headings/body — navy-ink, AA on white)
--jb-text-muted:         #4B5B7C  (secondary — AA on white ≥ 4.6:1)
--jb-border:             #DCE3F5  (1px borders)
--jb-success:            #157A3D   bg #E5F5EB
--jb-warning:            #9A6200   bg #FFF3DC
--jb-error:              #C81E1E   bg #FDECEC
--jb-info:               #1D4ED8   bg #E8EEFB
--jb-focus:              #1D4ED8  (2px outline + 2px offset, never removed)
```

Legacy aliases (`--brand`, `--accent`, `--bg`, …) are mapped to JB tokens for backward compatibility — do not use in new code. No other hues in UI; semantic colours are for status only.

## 3. Typography

System sans stack (no network font): `-apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif`.
Scale: display `clamp(2.25rem,5vw,3.75rem)/1.05/-0.03em/700`; h1 `clamp(1.6rem,2.4vw,2.25rem)/1.15/700`; h2 `1.25rem/1.3/700`; h3 `1.05rem/1.4/650`; body `1rem/1.6/400`; small `0.875rem/1.5`; caption/eyebrow `0.72rem/uppercase/+0.14em/700 muted`; button `0.95rem/600`; label `0.9rem/600`. One font family everywhere.

## 4. Spacing / radius / shadow / borders

Spacing scale (rem): `0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 / 3 / 4`. Page container `min(1180px, 100% - 2rem)`; section gap `3rem`; card padding `1.25–1.5rem`.
Radius: sm `10px` (inputs), md `14px` (panels), lg `18px` (cards), pill `999px` (CTAs, pills, badges). No other radii.
Shadows: `sm 0 1px 2px rgba(15,30,61,.06)`, `md 0 12px 30px rgba(15,30,61,.08)`; no glow/heavy shadows.
Borders: `1px solid var(--jb-border)`; never coloured borders except selected/focus/error states.

## 5. Icons

Inline SVG (stroke 1.8, round caps) for nav/actions; emoji removed from customer/admin nav. Icon size 18px (nav), 16px (inline). `aria-hidden="true"` on decorative icons; meaningful icon-buttons always carry `aria-label`.

## 6. Components

- **Button:** pill, primary = blue bg/white text; secondary = white bg/blue border+text; danger = white bg/red border+text (solid red only for confirmed destructive submit). Heights 44px (default, touch target), 40px small. States: hover (darker), active (darkest + translateY(0)), focus-visible ring, disabled (50% opacity, `not-allowed`), loading (`aria-busy`, spinner + label preserved).
- **Input/Select/Textarea:** 44px min-height, 10px radius, 1px border, white bg, focus = blue border + 3px soft ring; error = red border + message with `aria-describedby`; help text muted.
- **Checkbox/Radio/Switch:** 20px+ targets, blue checked, visible focus.
- **Card:** white, 1px border, lg radius, sm shadow; hover = border-blue + md shadow (product cards only); no lift on data cards.
- **Badge:** pill, uppercase 0.7rem/700; variants sale (blue), success/warning/error/info (semantic bg), neutral (muted). Status badges (`AdminStatusBadge`) map order/payment/fulfilment states to these — never raw hex.
- **Alert/Toast:** left blue/semantic border + tinted bg + `role=status|alert`; one style site-wide.
- **Tabs/Breadcrumbs/Pagination/Dropdown:** breadcrumbs = `nav > ol`; pagination = secondary buttons + "Page x of y"; dropdowns native `<select>` styled.
- **Dialog/Drawer:** overlay `rgba(15,30,61,.5)`, panel white lg radius, Escape closes, focus trapped + returned; destructive actions state consequence + require explicit confirm (no `window.confirm` in new code).
- **DataTable:** sticky header, row hover, 44px row actions, horizontal scroll container with shadow hint on mobile; always loading/empty/error states.
- **PageHeader:** eyebrow + h1 + description + actions row; admin adds breadcrumbs.
- **States:** loading = skeleton blocks (`.skeleton`) with `aria-busy`, never bare spinners for page loads; empty = centred card + explanation + next-action CTA; error = message + retry; success = confirmation card; disabled = obvious + accessible.
- **ProductCard:** media 4:5 on muted surface, sale badge, brand eyebrow, name, short desc, `PriceDisplay` (KES, compare-at strikethrough), wishlist action; hover: image scale 1.03 + border-blue.
- **PriceDisplay:** `en-KE` KES, compare-at only when greater; never invented.
- **StatusBadge / OrderTimeline:** payment vs fulfilment visually separated; only backend-defined states rendered.

## 7. Motion

150–250ms ease for hover/drawer/dialog; image scale ≤1.04; full `prefers-reduced-motion` reset (no transitions/animations).

## 8. Accessibility target

WCAG 2.2 AA: AA contrast pairs above, 44px targets, visible focus, labelled controls, semantic landmarks/headings, live regions for async feedback, touch + keyboard parity.
