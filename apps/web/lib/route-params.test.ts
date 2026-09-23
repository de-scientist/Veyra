import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for `params.then is not a function` (Next.js 14.2.15:
 * route params are synchronous objects, never Promises).
 * Walks every App Router page and fails on Promise-style params usage.
 */

const APP_DIR = join(__dirname, '..', 'app');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (/page\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

describe('Next.js 14 sync route params contract', () => {
  const files = pageFiles(APP_DIR);

  it('covers every dynamic route actually present', () => {
    const dynamic = files.filter((f) => f.includes('['));
    expect(dynamic.length).toBeGreaterThan(0);
    for (const f of [
      'admin\\products\\[id]',
      'products\\[slug]',
      'categories\\[slug]',
      'collections\\[slug]',
    ]) {
      expect(files.some((file) => file.includes(f)), f).toBe(true);
    }
  });

  it('never calls params.then (non-Promise object has no .then)', () => {
    const offenders = files.filter((f) => /params\s*\.then/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never types route params as a Promise', () => {
    const offenders = files.filter((f) => /params\s*:\s*Promise</.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never awaits params or passes params to React.use()', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /await\s+params\b/.test(src) || /use\s*\(\s*params/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
