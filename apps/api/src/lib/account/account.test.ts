import { describe, expect, it } from 'vitest';

import { buildOrderTimeline, validateProfileInput } from './account.js';

describe('account profile validation', () => {
  it('accepts valid first/last/phone updates', () => {
    expect(validateProfileInput({ firstName: 'Mark', lastName: 'Otieno', phone: '+254712345678' })).toEqual({
      firstName: 'Mark',
      lastName: 'Otieno',
      phone: '+254712345678',
    });
  });

  it('normalizes empty phone to null and ignores unknown fields', () => {
    expect(validateProfileInput({ phone: '   ' })).toEqual({ phone: null });
    expect(validateProfileInput({ firstName: 'Amina' })).toEqual({ firstName: 'Amina' });
  });

  it('rejects blank or overlong names', () => {
    expect(() => validateProfileInput({ firstName: '  ' })).toThrow();
    expect(() => validateProfileInput({ lastName: 'x'.repeat(121) })).toThrow();
  });

  it('rejects malformed phone numbers', () => {
    expect(() => validateProfileInput({ phone: 'not-a-phone!!' })).toThrow();
    expect(() => validateProfileInput({ phone: '123' })).toThrow();
  });

  it('returns an empty patch when nothing is supplied', () => {
    expect(validateProfileInput({})).toEqual({});
  });
});

describe('account order timeline', () => {
  it('merges status, payment, and delivery events in chronological order', () => {
    const deliveredAt = new Date('2026-09-10T10:00:00Z');
    const paidAt = new Date('2026-09-09T10:00:00Z');
    const placedAt = new Date('2026-09-08T10:00:00Z');
    const events = buildOrderTimeline({
      statusHistory: [{ status: 'PENDING', createdAt: placedAt, note: null }],
      payments: [{ status: 'PAID', createdAt: paidAt, provider: 'MPESA' }],
      deliveries: [{ history: [{ toStatus: 'DELIVERED', createdAt: deliveredAt, note: null }] }],
    });
    expect(events.map((e) => e.label)).toEqual(['Order pending', 'Payment paid', 'Delivery delivered']);
    expect(events[0]?.date).toEqual(placedAt);
  });

  it('never fabricates events when domain records are absent', () => {
    expect(buildOrderTimeline({})).toEqual([]);
    expect(buildOrderTimeline({ statusHistory: [], payments: [], deliveries: [] })).toEqual([]);
  });
});
