import type { Crumb } from '../components/ui/breadcrumb';

import { ADMIN_NAV_SECTIONS } from './admin-nav';

/**
 * Build admin breadcrumbs from the current pathname using the canonical nav
 * definition as the single source of truth (labels + real hrefs only).
 *
 * - Known item, exact path → [section, current].
 * - Known item + deeper segments → [section, item-link, humanized segments].
 *   Raw dynamic IDs are never displayed; the last segment reads "Details".
 * - Unknown paths → [section-if-prefix-matched, humanized trail] or dashboard.
 */
export function buildAdminBreadcrumbs(pathname: string): Crumb[] {
  const dashboard: Crumb = { label: 'Dashboard', href: '/admin/dashboard' };
  if (!pathname || !pathname.startsWith('/admin')) return [dashboard];
  if (pathname === '/admin' || pathname === '/admin/dashboard') return [dashboard];

  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href) {
        return [{ label: section.label }, { label: item.label }];
      }
      if (pathname.startsWith(`${item.href}/`)) {
        const rest = pathname.slice(item.href.length + 1).split('/').filter(Boolean);
        const crumbs: Crumb[] = [{ label: section.label }, { label: item.label, href: item.href }];
        rest.forEach((segment, index) => {
          const last = index === rest.length - 1;
          crumbs.push({ label: last && rest.length > 0 ? 'Details' : humanize(segment) });
        });
        return crumbs;
      }
    }
  }

  const trail = pathname
    .split('/')
    .filter((segment) => segment && segment !== 'admin')
    .map(humanize);
  return trail.length > 0 ? [{ label: 'Admin', href: '/admin/dashboard' }, { label: trail.join(' / ') }] : [dashboard];
}

function humanize(segment: string): string {
  const cleaned = segment.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return 'Details';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
