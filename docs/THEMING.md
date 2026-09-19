# Theming (Light / Dark / System)

Three modes: `light`, `dark`, `system` (follows OS). Source: `apps/web/components/ThemeProvider.tsx` + tokens in `apps/web/app/globals.css`.

## How It Works

1. **Persist**: choice stored in `localStorage` under `jb-mercantile-theme`.
2. **Pre-paint**: `ThemeScript` (blocking inline script in `app/layout.tsx`) resolves stored-or-system to `light`/`dark` before first paint — no theme flash — setting `documentElement[data-theme]` + `colorScheme` (falls back to `light` on error).
3. **Hydrate**: `ThemeProvider` reads storage on mount, applies tokens, and subscribes to OS changes only while in `system` mode.
4. **Select**: `ThemeToggle` menu (`menu`/`menuitemradio`, Light/Dark/System with sun/moon/monitor icons, check mark, arrow-key navigation, Escape/outside-click/Tab dismissal, focus return) in the header, mobile drawer, and account preferences.

## Themes

- **Light** (`:root`): white surfaces, navy text (`#0F1E3D`), muted `#4B5B7C`, action blue `#1D4ED8` (AA against white).
- **Dark** (`[data-theme="dark"]`): hand-designed deep navy (`#0B1222`/`#121B31`/`#1A2542`), lightened action blue `#3F6FE0` (keeps white-text contrast), muted `#A9B7D6` — not an inversion.
- Semantic aliases (`--background`, `--surface`, `--primary`, …) plus legacy `--bg/--brand/--text` aliases for older code.

## Compatibility Rules

All components (dialogs, drawers, icons via `currentColor`, focus rings, form errors, toasts, toggles) use theme variables. Logos: blue-on-white PNGs render inside a white `.jb-logo-chip` in dark mode — never CSS filters on the artwork. Placeholder text is pinned to muted (AA both themes). Status is never color-only (text labels accompany badges/stock).
