import { describe, expect, it } from 'vitest';
import { main } from '../../../prisma/seed.catalogue';
import { calculateAvailableQuantity } from './catalog.js';

describe('tmp', () => {
  it('loads', () => {
    expect(typeof main).toBe('function');
    expect(calculateAvailableQuantity(1, 0)).toBe(1);
  });
});
