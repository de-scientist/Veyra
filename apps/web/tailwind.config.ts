import type { Config } from "tailwindcss";

/**
 * JB Mercantile Tailwind configuration — Tailwind-first foundation wired to the
 * single token source in `app/globals.css` (`--jb-*` / semantic aliases).
 *
 * Coexistence rules (do not "fix" by deleting either side):
 * - `corePlugins.preflight: false` — the hand-written base in globals.css owns
 *   resets/typography/focus. Tailwind preflight would double-reset and shift
 *   the existing visual baseline.
 * - Colors reference `var(--…)` so light/dark themes switch via `data-theme`
 *   with zero duplicated hex values. Consequence: Tailwind opacity modifiers
 *   (`bg-primary/50`) do NOT work on var-based colors — use `color-mix()` in
 *   CSS or a dedicated tint token instead.
 * - Custom JB breakpoints (1020/900/640px) live as media queries in
 *   globals.css; Tailwind's default screens are kept for utility use.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--surface)",
        "card-foreground": "var(--foreground)",
        popover: "var(--surface-elevated)",
        "popover-foreground": "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--foreground)",
        },
        muted: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--jb-primary-soft)",
          foreground: "var(--foreground)",
        },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--focus)",
        success: "var(--success)",
        warning: "var(--warning)",
        destructive: "var(--error)",
        info: "var(--info)",
        // Direct JB namespace for one-off needs; prefer semantic tokens above.
        jb: {
          primary: "var(--jb-primary)",
          "primary-hover": "var(--jb-primary-hover)",
          "primary-active": "var(--jb-primary-active)",
          "primary-strong": "var(--jb-primary-strong)",
          "primary-soft": "var(--jb-primary-soft)",
          surface: "var(--jb-surface)",
          "surface-elevated": "var(--jb-surface-elevated)",
          "surface-muted": "var(--jb-surface-muted)",
        },
      },
      borderRadius: {
        sm: "var(--jb-radius-sm)",
        md: "var(--jb-radius-md)",
        lg: "var(--jb-radius-lg)",
        pill: "var(--jb-radius-pill)",
      },
      boxShadow: {
        xs: "var(--jb-shadow-sm)",
        sm: "var(--jb-shadow-sm)",
        md: "var(--jb-shadow-md)",
        lg: "var(--jb-shadow-md)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Inter",
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: {
        container: "1180px",
      },
    },
  },
  plugins: [],
};

export default config;
