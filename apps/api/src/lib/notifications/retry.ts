import { env } from '../env.js';

export type FailureClassification = 'transient' | 'permanent';

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'PROVIDER_TIMEOUT',
  'PROVIDER_5XX',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK_ERROR',
]);

const PERMANENT_CODES = new Set([
  'INVALID_EMAIL',
  'INVALID_PHONE',
  'UNSUPPORTED_DESTINATION',
  'INVALID_TEMPLATE',
  'MESSAGE_REJECTED',
  'EMAIL_PROVIDER_NOT_CONFIGURED',
  'SMS_PROVIDER_NOT_CONFIGURED',
  'RECIPIENT_UNKNOWN',
  'VALIDATION_ERROR',
]);

/** Classify a provider failure. Unknown codes are transient (safe: bounded by max attempts). */
export function classifyFailure(failureCode: string | null | undefined): FailureClassification {
  if (!failureCode) return 'transient';
  const normalized = failureCode.toUpperCase();
  if (PERMANENT_CODES.has(normalized)) return 'permanent';
  if (TRANSIENT_CODES.has(normalized)) return 'transient';
  if (/^5\d\d$/.test(normalized) || normalized.includes('TIMEOUT') || normalized.includes('RATE_LIMIT') || normalized.includes('UNAVAILABLE')) return 'transient';
  if (/^4\d\d$/.test(normalized) || normalized.includes('INVALID') || normalized.includes('REJECT')) return 'permanent';
  return 'transient';
}

/**
 * Exponential backoff with jitter: delay = min(base * 2^attempt, max) + jitter.
 * `random` is injectable for deterministic tests.
 */
export function computeBackoffMs(attempt: number, random: () => number = Math.random): number {
  const base = env.NOTIFICATION_BASE_DELAY_MS;
  const max = env.NOTIFICATION_MAX_DELAY_MS;
  const exponential = Math.min(base * 2 ** Math.max(0, attempt), max);
  const jitter = Math.floor(random() * Math.min(base, 5000));
  return exponential + jitter;
}

export function maxAttempts(): number {
  return env.NOTIFICATION_MAX_ATTEMPTS;
}

export function shouldRetry(attemptCount: number, classification: FailureClassification): boolean {
  return classification === 'transient' && attemptCount < maxAttempts();
}
