import { describe, expect, it } from 'vitest';

import { clampExportLimit, REPORT_KEYS, toCsv } from './reports.js';
import {
  averageOrNull,
  granularityFor,
  nairobiDayStart,
  parseRange,
  percentChange,
  presetRange,
  previousPeriod,
} from './periods.js';

// 2026-09-18T12:00:00Z == 15:00 in Nairobi (UTC+3, no DST).
const NOON_UTC = new Date('2026-09-18T12:00:00Z');

describe('reporting timezone', () => {
  it('starts Nairobi days at 21:00 UTC the prior day', () => {
    expect(nairobiDayStart(NOON_UTC).toISOString()).toBe('2026-09-17T21:00:00.000Z');
  });

  it('builds half-open preset ranges on day boundaries', () => {
    const today = presetRange('today', NOON_UTC);
    expect(today.start.toISOString()).toBe('2026-09-17T21:00:00.000Z');
    expect(today.end.toISOString()).toBe('2026-09-18T21:00:00.000Z');
    const last7 = presetRange('last7', NOON_UTC);
    expect(last7.end.getTime() - last7.start.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('rejects inverted, oversized, and future ranges', () => {
    const cases: Array<[string | undefined, string | undefined, string]> = [
      ['2026-09-10T00:00:00Z', '2026-09-01T00:00:00Z', 'INVALID_DATE_RANGE'],
      ['2020-01-01T00:00:00Z', '2026-09-18T00:00:00Z', 'RANGE_TOO_LARGE'],
      ['not-a-date', undefined, 'INVALID_DATE_RANGE'],
    ];
    for (const [from, to, code] of cases) {
      try {
        parseRange(from, to);
        expect.unreachable(`expected ${code}`);
      } catch (error) {
        expect((error as { code?: string }).code).toBe(code);
      }
    }
  });

  it('derives the previous equal-length period', () => {
    const current = presetRange('last7', NOON_UTC);
    const previous = previousPeriod(current);
    expect(previous.end.getTime()).toBe(current.start.getTime());
    expect(previous.end.getTime() - previous.start.getTime()).toBe(current.end.getTime() - current.start.getTime());
  });

  it('selects granularity by range length', () => {
    expect(granularityFor({ start: NOON_UTC, end: new Date(NOON_UTC.getTime() + 24 * 3600 * 1000) })).toBe('hour');
    expect(granularityFor(presetRange('last30', NOON_UTC))).toBe('day');
    expect(granularityFor(presetRange('thisYear', NOON_UTC))).toBe('week');
  });
});

describe('percent change', () => {
  it('never emits Infinity or NaN', () => {
    expect(percentChange(10, 0)).toEqual({ value: null, label: 'New — no prior-period baseline' });
    expect(percentChange(0, 0)).toEqual({ value: null, label: 'No change' });
    expect(percentChange(150, 100).value).toBe(50);
    expect(percentChange(50, 100).value).toBe(-50);
  });

  it('returns null averages for empty denominators', () => {
    expect(averageOrNull(100, 0)).toBeNull();
    expect(averageOrNull(100, 4)).toBe(25);
  });
});

describe('csv exports', () => {
  it('escapes commas, quotes, and newlines', () => {
    const csv = toCsv(['name', 'note'], [['Plain', 'has, comma'], ['"Quoted"', 'line\nbreak']]);
    expect(csv).toBe('name,note\nPlain,"has, comma"\n"""Quoted""","line\nbreak"\n');
  });

  it('clamps export limits', () => {
    expect(clampExportLimit(undefined)).toBe(1000);
    expect(clampExportLimit(0)).toBe(1000);
    expect(clampExportLimit(99999)).toBe(5000);
    expect(clampExportLimit(250)).toBe(250);
  });

  it('covers the documented report set', () => {
    expect([...REPORT_KEYS].sort()).toEqual(['customers', 'inventory', 'orders', 'payments', 'products', 'refunds', 'sales']);
  });
});
