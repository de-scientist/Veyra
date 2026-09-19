# Accessibility

Target: strong WCAG 2.2 AA engineering practice (no formal certification claimed).

## Keyboard

Full shopping journey operable keyboard-only: skip link → nav → combobox search (↑↓/Enter/Escape) → filters (checkboxes/radios) → variant selection → add to cart → checkout → payment → account/admin. Drawers/dialogs trap Tab/Shift+Tab (including pull-back if focus escapes), close on Escape, and restore focus to the trigger. Theme menu supports arrows/Escape/Tab-away. Toggle switches are real checkboxes.

## Semantics & Labels

Single-H1 pages, landmarks (`header`/`nav`/`main`/`footer`), no redundant roles, buttons for actions / links for navigation, no clickable divs. Icon-only buttons all named; decorative SVGs `aria-hidden`. Logo alt is empty inside labelled brand links, `"JB Mercantile"` standalone. Forms have real labels (never placeholder-only), typed inputs, inline errors; auth errors use `role="alert"`. Suggestion input is a true `combobox` with `aria-autocomplete="list"`.

## Perception & Motion

Focus always visible (`:focus-visible` ring; never removed without replacement). Contrast AA pairs in both themes. State never color-only. Touch targets ≥44px for icon controls, nav links 48px, drawer/dialog actions forced to 44px. `prefers-reduced-motion` disables transitions/zoom, preserving feedback.

## Dialogs

`JBConfirmDialog` (`role="alertdialog"`, labelledby/describedby, Cancel-first focus, loading guard against double-submit, inline API errors, all themes). Backdrops are mouse-only dismiss layers (`aria-hidden`), never keyboard-focusable.

## Testing

Automated: typecheck, lint, unit/security/smoke suites (101 tests) — these do **not** cover accessibility. No axe/eslint-a11y/Playwright-a11y in-repo (intentionally, per scope). Manual keyboard review was code-path tracing only. Live screen-reader/device/browser testing: **NOT VERIFIED — MANUAL DEVICE/ASSISTIVE TECHNOLOGY TEST REQUIRED**.
