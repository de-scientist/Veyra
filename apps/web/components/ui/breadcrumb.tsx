'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { JBIcon } from '../JBIcons';

export type Crumb = { label: string; href?: string };

/**
 * shadcn-compatible Breadcrumb. Every `href` must be a real route; the final
 * crumb is plain text with `aria-current="page"`. Dynamic IDs are never shown
 * — callers pass display labels (see `lib/breadcrumbs`).
 */
export function Breadcrumb({ items, label = 'Breadcrumb' }: { items: Crumb[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className="ui-breadcrumbs">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 ? (
                <span className="ui-breadcrumbs__separator" aria-hidden="true">
                  <JBIcon name="chevron-right" size={14} />
                </span>
              ) : null}
              {item.href && !last ? (
                <Link href={item.href as Route}>{item.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
