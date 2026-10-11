'use client';

import type { ReactNode } from 'react';

/**
 * shadcn-compatible Tooltip: CSS-only bubble on hover/focus-within, so there
 * is no JS layering or portal to maintain. The child must be a single
 * focusable element (link/button) for keyboard users; the bubble itself is
 * `role="tooltip"` and never interactive.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="ui-tooltip">
      {children}
      <span className="ui-tooltip__bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}
