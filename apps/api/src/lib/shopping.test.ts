import { describe, expect, it } from 'vitest';

import { MAX_CART_ITEM_QUANTITY, isValidCartQuantity } from './shopping.js';
import { calculateAvailableQuantity } from './catalog.js';

describe('shopping rules', () => {
  it('accepts positive integer quantities up to the configured maximum', () => {
    expect(isValidCartQuantity(1)).toBe(true);
    expect(isValidCartQuantity(MAX_CART_ITEM_QUANTITY)).toBe(true);
    expect(isValidCartQuantity(MAX_CART_ITEM_QUANTITY + 1)).toBe(false);
  });

  it('rejects zero, negative, fractional, and non-finite quantities', () => {
    expect(isValidCartQuantity(0)).toBe(false);
    expect(isValidCartQuantity(-1)).toBe(false);
    expect(isValidCartQuantity(1.5)).toBe(false);
    expect(isValidCartQuantity(Number.NaN)).toBe(false);
    expect(isValidCartQuantity(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('never reports negative available inventory', () => {
    expect(calculateAvailableQuantity(5, 2)).toBe(3);
    expect(calculateAvailableQuantity(2, 5)).toBe(0);
  });
});