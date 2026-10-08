import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type UIBadgeTone = "blue" | "green" | "red" | "amber" | "neutral";

/**
 * Tailwind-first Badge. Text + color (never color-only state).
 * Parity target: existing `.status-badge` in globals.css.
 */
const TONE_CLASSES: Record<UIBadgeTone, string> = {
  blue: "bg-[var(--jb-info-bg)] text-[var(--info)]",
  green: "bg-[var(--jb-success-bg)] text-[var(--success)]",
  red: "bg-[var(--jb-error-bg)] text-[var(--error)]",
  amber: "bg-[var(--jb-warning-bg)] text-[var(--warning)]",
  neutral: "bg-[var(--surface-muted)] text-[var(--muted-foreground)]",
};

const STATUS_TO_TONE: Array<[RegExp, UIBadgeTone]> = [
  [/^(paid|completed|delivered|active|approved|succeeded|resolved|received|confirmed)$/i, "green"],
  [/^(failed|cancelled|canceled|rejected|unpaid|expired)$/i, "red"],
  [/^(pending|processing|requested|shipped|refunded|under review)$/i, "amber"],
];

export function badgeToneFor(status: string): UIBadgeTone {
  const s = status.trim();
  for (const [re, tone] of STATUS_TO_TONE) {
    if (re.test(s)) return tone;
  }
  return "blue";
}

export function UIBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: UIBadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Drop-in status badge: derives tone from order/payment status text. */
export function UIStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <UIBadge tone={badgeToneFor(status)} className={className}>
      {status.replace(/_/g, " ")}
    </UIBadge>
  );
}
