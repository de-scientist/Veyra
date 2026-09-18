import { env } from './env.js';

/**
 * Per-route rate-limit budgets. Keyed by IP by default (plugin default);
 * see PHASE-14-REPORT for the full matrix and the shared-network rationale.
 */
function budget(max: number) {
  return { rateLimit: { max, timeWindow: env.RATE_LIMIT_WINDOW_MS } };
}

/** Brute-force-sensitive: login, register, password change, account lifecycle, exports. */
export function authLimit() {
  return { config: budget(env.RATE_LIMIT_AUTH_MAX) };
}

/** Costly or state-changing: checkout, payment initiation, refunds, resends. */
export function sensitiveLimit() {
  return { config: budget(env.RATE_LIMIT_SENSITIVE_MAX) };
}
