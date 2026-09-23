import { HttpError } from '../errors.js';

/** Kenya-first reporting timezone. Africa/Nairobi has no DST: fixed UTC+3. */
export const REPORT_TIMEZONE = 'Africa/Nairobi';
export const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

export const MAX_RANGE_DAYS = 400;

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export type Period = { start: Date; end: Date };

export type Comparison = { current: Period; previous: Period };

/** Midnight (start of day) in Nairobi for the given instant, returned as UTC. */
export function nairobiDayStart(instant: Date): Date {
  const shifted = new Date(instant.getTime() + NAIROBI_OFFSET_MS);
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(midnight - NAIROBI_OFFSET_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfWeekNairobi(dayStart: Date): Date {
  // Weeks start Monday (Nairobi wall time).
  const shifted = new Date(dayStart.getTime() + NAIROBI_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=Sun..6=Sat
  const daysBack = (dow + 6) % 7;
  return addDays(dayStart, -daysBack);
}

function startOfMonthNairobi(dayStart: Date): Date {
  const shifted = new Date(dayStart.getTime() + NAIROBI_OFFSET_MS);
  const first = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  return new Date(first - NAIROBI_OFFSET_MS);
}

function startOfQuarterNairobi(dayStart: Date): Date {
  const shifted = new Date(dayStart.getTime() + NAIROBI_OFFSET_MS);
  const quarterMonth = Math.floor(shifted.getUTCMonth() / 3) * 3;
  const first = Date.UTC(shifted.getUTCFullYear(), quarterMonth, 1);
  return new Date(first - NAIROBI_OFFSET_MS);
}

function startOfYearNairobi(dayStart: Date): Date {
  const shifted = new Date(dayStart.getTime() + NAIROBI_OFFSET_MS);
  const first = Date.UTC(shifted.getUTCFullYear(), 0, 1);
  return new Date(first - NAIROBI_OFFSET_MS);
}

export type PresetKey =
  | 'today' | 'yesterday' | 'last7' | 'last30'
  | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'
  | 'thisQuarter' | 'thisYear';

export function presetRange(preset: PresetKey, now: Date = new Date()): Period {
  const today = nairobiDayStart(now);
  switch (preset) {
    case 'today': return { start: today, end: addDays(today, 1) };
    case 'yesterday': return { start: addDays(today, -1), end: today };
    case 'last7': return { start: addDays(today, -6), end: addDays(today, 1) };
    case 'last30': return { start: addDays(today, -29), end: addDays(today, 1) };
    case 'thisWeek': {
      const start = startOfWeekNairobi(today);
      return { start, end: addDays(today, 1) };
    }
    case 'lastWeek': {
      const start = startOfWeekNairobi(today);
      return { start: addDays(start, -7), end: start };
    }
    case 'thisMonth': return { start: startOfMonthNairobi(today), end: addDays(today, 1) };
    case 'lastMonth': {
      const start = startOfMonthNairobi(today);
      const prev = new Date(Date.UTC(new Date(start.getTime() + NAIROBI_OFFSET_MS).getUTCFullYear(), new Date(start.getTime() + NAIROBI_OFFSET_MS).getUTCMonth() - 1, 1) - NAIROBI_OFFSET_MS);
      return { start: prev, end: start };
    }
    case 'thisQuarter': return { start: startOfQuarterNairobi(today), end: addDays(today, 1) };
    case 'thisYear': return { start: startOfYearNairobi(today), end: addDays(today, 1) };
  }
}

/** Parse an explicit half-open [from, to) range with safety bounds. */
export function parseRange(fromRaw: string | undefined, toRaw: string | undefined, now: Date = new Date()): Period {
  const fallback = presetRange('last30', now);
  const start = fromRaw ? new Date(fromRaw) : fallback.start;
  const end = toRaw ? new Date(toRaw) : fallback.end;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, 'INVALID_DATE_RANGE', 'from/to must be valid ISO datetimes.');
  }
  if (end <= start) throw new HttpError(400, 'INVALID_DATE_RANGE', 'The end of the range must be after its start.');
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'RANGE_TOO_LARGE', `Analytics ranges are limited to ${MAX_RANGE_DAYS} days. Narrow the range or export in slices.`);
  }
  if (start > now) throw new HttpError(400, 'INVALID_DATE_RANGE', 'The range must not start in the future.');
  return { start, end };
}

/** Previous equal-length period immediately before the current one. */
export function previousPeriod(period: Period): Period {
  const length = period.end.getTime() - period.start.getTime();
  return { start: new Date(period.start.getTime() - length), end: period.start };
}

export function granularityFor(period: Period): Granularity {
  const days = (period.end.getTime() - period.start.getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 2) return 'hour';
  if (days <= 93) return 'day';
  if (days <= 400) return 'week';
  return 'month';
}

export type PercentChange = { value: number | null; label: string };

/**
 * Period-over-period change that never emits Infinity/NaN:
 * both zero → null ("No change"); previous zero → null ("New").
 */
export function percentChange(current: number, previous: number): PercentChange {
  if (previous === 0 && current === 0) return { value: null, label: 'No change' };
  if (previous === 0) return { value: null, label: 'New — no prior-period baseline' };
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return { value: Math.round(value * 10) / 10, label: `${value >= 0 ? '+' : ''}${(Math.round(value * 10) / 10).toFixed(1)}%` };
}

export function averageOrNull(total: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((total / count) * 100) / 100;
}

/** Format a UTC instant as a Nairobi wall-time label for chart axes. */
export function nairobiLabel(instant: Date, granularity: Granularity): string {
  const shifted = new Date(instant.getTime() + NAIROBI_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  if (granularity === 'hour') return `${date} ${pad(shifted.getUTCHours())}:00`;
  if (granularity === 'month') return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
  return date;
}
