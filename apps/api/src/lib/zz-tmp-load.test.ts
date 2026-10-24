import { describe, expect, it } from 'vitest';
import { calculateAvailableQuantity } from './catalog.js';
import { API_NAME } from '../../../packages/config/src/index';

describe('tmp', () => {
  it('loads', () => {
    expect(calculateAvailableQuantity(1, 0)).toBe(1);
    expect(typeof API_NAME).toBe('string');
  });
});
