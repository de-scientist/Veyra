import { describe, expect, it } from 'vitest';

import { discoveryQueryString, parseDiscoveryQuery } from './catalog';

describe('discovery URL state (Phase G)', () => {
  it('parses collection scope without leaking it into attribute facets', () => {
    const query = parseDiscoveryQuery({ collection: 'weekend-edit', Color: 'Black', sort: 'price-asc' });
    expect(query.collection).toBe('weekend-edit');
    expect(query.attrs).toEqual({ Color: ['Black'] });
    expect(query.sort).toBe('price-asc');
  });

  it('round-trips collection scope through serialization', () => {
    const query = parseDiscoveryQuery({ collection: 'weekend-edit', sort: 'newest', page: '2' });
    const s = discoveryQueryString(query);
    expect(s).toContain('collection=weekend-edit');
    const reparsed = parseDiscoveryQuery(Object.fromEntries(new URLSearchParams(s.slice(1))));
    expect(reparsed.collection).toBe('weekend-edit');
    expect(reparsed.sort).toBe('newest');
    expect(reparsed.page).toBe(2);
  });

  it('omits collection when unset (shop/category URLs unchanged)', () => {
    const query = parseDiscoveryQuery({ q: 'blender', category: 'kitchen-home' });
    expect(query.collection).toBeUndefined();
    expect(discoveryQueryString(query)).not.toContain('collection');
  });

  it('keeps page reset semantics: page 1 is omitted from URLs', () => {
    expect(discoveryQueryString({ collection: 'weekend-edit', page: 1 })).toBe('?collection=weekend-edit');
  });
});
