import { describe, expect, it } from 'vitest';

import { queryString, toAnalyticsDateTime } from './analytics-api';

describe('toAnalyticsDateTime', () => {
  it('normalizes date-only days to Nairobi midnight with offset', () => {
    expect(toAnalyticsDateTime('2026-09-25')).toBe('2026-09-25T00:00:00+03:00');
    expect(toAnalyticsDateTime('2026-09-27')).toBe('2026-09-27T00:00:00+03:00');
  });

  it('passes full ISO datetimes through untouched', () => {
    expect(toAnalyticsDateTime('2026-09-25T00:00:00+03:00')).toBe('2026-09-25T00:00:00+03:00');
    expect(toAnalyticsDateTime('2026-09-25T10:30:00Z')).toBe('2026-09-25T10:30:00Z');
  });
});

describe('queryString', () => {
  it('sends the reported failing request as backend-valid datetimes', () => {
    const query = queryString({ from: '2026-09-25', to: '2026-09-27', compare: true });
    expect(query).toContain(`from=${encodeURIComponent('2026-09-25T00:00:00+03:00')}`);
    expect(query).toContain(`to=${encodeURIComponent('2026-09-27T00:00:00+03:00')}`);
    expect(query).toContain('compare=true');
    // Every from/to value must carry a timezone offset (backend contract).
    for (const value of ['2026-09-25', '2026-09-27']) {
      expect(toAnalyticsDateTime(value)).toMatch(/[+-]\d{2}:\d{2}$/);
    }
  });

  it('omits compare when disabled and supports presets', () => {
    expect(queryString({ preset: 'last30' })).toBe('?preset=last30');
    expect(queryString({ preset: 'last30', compare: false })).toBe('?preset=last30');
    expect(queryString({ preset: 'last7', compare: true })).toBe('?preset=last7&compare=true');
  });

  it('builds an empty string when no filters are set', () => {
    expect(queryString({})).toBe('');
  });
});
