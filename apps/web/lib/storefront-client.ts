'use client';

/**
 * Browser-side storefront reads (Phase E). Server pages use
 * `lib/storefront.ts`; interactive client components (header navigation,
 * search suggestions) use these lightweight fetchers against the same
 * public `/catalog/*` API. No secrets, no session required.
 */

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type NavCategory = { slug: string; name: string; parentSlug: string | null; pillar: string };

type CategoryNode = {
  slug: string;
  name: string;
  parentId: string | null;
  children: CategoryNode[];
};

function flatten(nodes: CategoryNode[], pillar: string, parentSlug: string | null, out: NavCategory[]): NavCategory[] {
  for (const node of nodes) {
    out.push({ slug: node.slug, name: node.name, parentSlug, pillar });
    flatten(node.children, pillar, node.slug, out);
  }
  return out;
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1${path}`, { credentials: 'omit' });
    if (!response.ok) return null;
    const body = (await response.json()) as { data: T };
    return body.data;
  } catch {
    return null;
  }
}

/** Flat category list with pillar + parent slugs for navigation grouping. */
export async function getNavCategories(): Promise<NavCategory[]> {
  const tree = await get<CategoryNode[]>('/catalog/categories');
  if (!tree) return [];
  const out: NavCategory[] = [];
  for (const pillar of tree) {
    out.push({ slug: pillar.slug, name: pillar.name, parentSlug: null, pillar: pillar.slug });
    flatten(pillar.children, pillar.slug, pillar.slug, out);
  }
  return out;
}

export type Suggestion = { type: 'product' | 'category' | 'collection'; label: string; href: string };

export async function getSuggestions(query: string): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];
  return (await get<Suggestion[]>(`/catalog/suggest?q=${encodeURIComponent(query.trim())}`)) ?? [];
}
