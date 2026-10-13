import { describe, expect, it } from 'vitest';

import { pricePairIssue } from './catalogue.js';

/**
 * Previous-price rule (INVALID_PRICE): when both sides are present the
 * compare-at price must strictly exceed the selling price. Either side
 * absent = no sale = valid. Pure unit coverage for the schema + handler
 * guard shared by manual, generate, single PATCH and batch PATCH writes.
 */
describe('variant price-pair validation', () => {
  it('accepts a previous price above the selling price', () => {
    expect(pricePairIssue(2500, 3000)).toBeNull();
  });

  it('treats a missing side as no sale (valid)', () => {
    expect(pricePairIssue(2500, null)).toBeNull();
    expect(pricePairIssue(2500, undefined)).toBeNull();
    expect(pricePairIssue(null, 3000)).toBeNull();
    expect(pricePairIssue(undefined, 3000)).toBeNull();
    expect(pricePairIssue(null, null)).toBeNull();
  });

  it('rejects equal or lower previous prices', () => {
    expect(pricePairIssue(2500, 2500)).toContain('higher');
    expect(pricePairIssue(2700, 2500)).toContain('higher');
    expect(pricePairIssue(2500, 0)).toContain('higher');
  });
});
