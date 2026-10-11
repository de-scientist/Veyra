'use client';

import { cn } from '../../lib/cn';

/** shadcn-compatible Separator on the JB border token. */
export function Separator({ orientation = 'horizontal', className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('ui-separator', orientation === 'vertical' && 'ui-separator--vertical', className)}
    />
  );
}
