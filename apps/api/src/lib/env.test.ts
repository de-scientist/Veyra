import { describe, expect, it } from 'vitest';

import { env } from './env.js';

describe('environment validation', () => {
  it('loads default env values', () => {
    expect(env.NODE_ENV).toBeDefined();
    expect(env.API_PORT).toBeGreaterThan(0);
  });
});
