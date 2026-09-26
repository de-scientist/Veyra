import { describe, expect, it } from 'vitest';

import { rangeSchema } from './analytics.js';
import { checkoutSchema } from './checkout.js';

const checkoutBase = {
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '0712345678',
  deliveryMethodId: '11111111-1111-4111-8111-111111111111',
};

describe('analytics range contract (Phase A)', () => {
  it('rejects date-only from/to — the reported 400 root cause', () => {
    for (const query of [
      { from: '2026-09-25', to: '2026-09-27', compare: true },
      { from: '2026-09-25', to: '2026-09-27T00:00:00+03:00' },
    ]) {
      expect(rangeSchema.safeParse(query).success).toBe(false);
    }
  });

  it('accepts the frontend-normalized Nairobi datetimes with compare coercion', () => {
    const parsed = rangeSchema.safeParse({
      from: '2026-09-25T00:00:00+03:00',
      to: '2026-09-27T00:00:00+03:00',
      compare: 'true',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.from).toBe('2026-09-25T00:00:00+03:00');
      expect(parsed.data.compare).toBe(true);
    }
  });

  it('defaults compare to false and keeps presets working', () => {
    const parsed = rangeSchema.safeParse({ preset: 'last30' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.compare).toBe(false);
  });
});

describe('checkout zone contract (Phase A)', () => {
  it('rejects blank zone codes at validation', () => {
    expect(checkoutSchema.safeParse({ ...checkoutBase, shippingZoneCode: '' }).success).toBe(false);
  });

  it('accepts an omitted zone (backend then returns the controlled select-zone 400)', () => {
    const parsed = checkoutSchema.safeParse({ ...checkoutBase });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.shippingZoneCode).toBeUndefined();
  });

  it('accepts a valid zone code', () => {
    const parsed = checkoutSchema.safeParse({ ...checkoutBase, shippingZoneCode: 'NRB' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.shippingZoneCode).toBe('NRB');
  });
});
