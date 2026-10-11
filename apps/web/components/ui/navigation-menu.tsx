'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * shadcn-compatible NavigationMenu: semantic nav + list with active-link
 * semantics. Active state never relies on colour alone (`aria-current` plus a
 * shape indicator in CSS).
 */
export function NavigationMenu({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className={cn('ui-nav', className)}>
      <ul className="ui-nav__list">{children}</ul>
    </nav>
  );
}

export function NavigationMenuItem({ children }: { children: ReactNode }) {
  return <li className="ui-nav__item">{children}</li>;
}

export function NavigationMenuLink({
  href,
  active = false,
  onNavigate,
  className,
  children,
}: {
  href: string;
  active?: boolean;
  onNavigate?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn('ui-nav__link', active && 'is-active', className)}
    >
      {children}
    </Link>
  );
}
