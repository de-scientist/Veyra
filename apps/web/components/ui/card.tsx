import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Tailwind-first Card primitives. Restrained shadow (sm only) per the design
 * system — elevation comes from borders, not floating cards.
 */
export function UICard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card text-foreground shadow-sm", className)}>
      {children}
    </div>
  );
}

export function UICardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function UICardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("border-b border-border px-6 py-4", className)}>{children}</div>
  );
}
