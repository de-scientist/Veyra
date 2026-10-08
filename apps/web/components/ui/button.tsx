import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export type UIButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type UIButtonSize = "sm" | "md" | "lg";

/**
 * Tailwind-first Button. Token-driven (`bg-primary`, `text-foreground`, …) so
 * light/dark themes track `data-theme` automatically.
 * Visual parity target: existing `.button` classes in globals.css.
 */
const VARIANT_CLASSES: Record<UIButtonVariant, string> = {
  primary:
    "bg-primary text-[var(--primary-foreground)] hover:bg-[var(--jb-primary-hover)] active:bg-[var(--jb-primary-active)]",
  secondary:
    "bg-card text-foreground border border-border hover:border-[var(--border-strong)] hover:bg-[var(--jb-primary-soft)]",
  danger:
    "bg-card text-[var(--error)] border border-[var(--error)] hover:bg-[var(--jb-error-bg)]",
  ghost: "bg-transparent text-foreground hover:bg-[var(--jb-primary-soft)]",
};

const SIZE_CLASSES: Record<UIButtonSize, string> = {
  sm: "min-h-[36px] px-3 text-sm",
  md: "min-h-[44px] px-5 text-[0.95rem]",
  lg: "min-h-[48px] px-6 text-base",
};

export interface UIButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UIButtonVariant;
  size?: UIButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function UIButton({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: UIButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill font-semibold",
        "transition-colors motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
