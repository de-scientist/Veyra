import { describe, expect, it } from 'vitest';
import { DeliveryStatus } from '@prisma/client';

import { isLegalDeliveryTransition } from './fulfillment.js';

describe('delivery state machine', () => {
  it('allows the pickup lifecycle without entering transit', () => {
    expect(isLegalDeliveryTransition(DeliveryStatus.PENDING, DeliveryStatus.PREPARING)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.PREPARING, DeliveryStatus.PICKED)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.PICKED, DeliveryStatus.PACKED)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.PACKED, DeliveryStatus.READY_FOR_PICKUP)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.READY_FOR_PICKUP, DeliveryStatus.PICKED_UP)).toBe(true);
  });

  it('allows local delivery progression and failed-attempt retry', () => {
    expect(isLegalDeliveryTransition(DeliveryStatus.PACKED, DeliveryStatus.ASSIGNED)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.ASSIGNED, DeliveryStatus.IN_TRANSIT)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.IN_TRANSIT, DeliveryStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.DELIVERY_ATTEMPTED)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.DELIVERY_ATTEMPTED, DeliveryStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(isLegalDeliveryTransition(DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.DELIVERED)).toBe(true);
  });

  it('rejects bypassing preparation or reversing terminal delivery', () => {
    expect(isLegalDeliveryTransition(DeliveryStatus.PENDING, DeliveryStatus.DELIVERED)).toBe(false);
    expect(isLegalDeliveryTransition(DeliveryStatus.PREPARING, DeliveryStatus.DELIVERED)).toBe(false);
    expect(isLegalDeliveryTransition(DeliveryStatus.DELIVERED, DeliveryStatus.OUT_FOR_DELIVERY)).toBe(false);
  });
});