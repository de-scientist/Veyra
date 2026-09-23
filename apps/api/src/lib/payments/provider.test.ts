import { describe, expect, it } from 'vitest';

import { buildPaymentCorrelationKey } from './mpesa.js';

 describe('payment provider boundaries', () => {
  it('creates a deterministic opaque correlation key', () => {
    const first = buildPaymentCorrelationKey('order-1', 'attempt-1');
    expect(first).toBe(buildPaymentCorrelationKey('order-1', 'attempt-1'));
    expect(first).not.toContain('order-1');
    expect(first).not.toContain('attempt-1');
  });

  it('separates different order and attempt combinations', () => {
    expect(buildPaymentCorrelationKey('order-1', 'attempt-1')).not.toBe(buildPaymentCorrelationKey('order-2', 'attempt-1'));
    expect(buildPaymentCorrelationKey('order-1', 'attempt-1')).not.toBe(buildPaymentCorrelationKey('order-1', 'attempt-2'));
  });
});
