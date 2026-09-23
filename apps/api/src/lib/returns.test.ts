import { describe, expect, it } from 'vitest';
import { ReturnStatus } from '@prisma/client';

import { isLegalReturnTransition } from './returns.js';

describe('return state machine', () => {
  it('allows review through resolution preparation', () => {
    expect(isLegalReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.UNDER_REVIEW)).toBe(true);
    expect(isLegalReturnTransition(ReturnStatus.UNDER_REVIEW, ReturnStatus.APPROVED)).toBe(true);
    expect(isLegalReturnTransition(ReturnStatus.APPROVED, ReturnStatus.RECEIVED)).toBe(true);
    expect(isLegalReturnTransition(ReturnStatus.RECEIVED, ReturnStatus.INSPECTING)).toBe(true);
    expect(isLegalReturnTransition(ReturnStatus.INSPECTING, ReturnStatus.APPROVED_FOR_RESOLUTION)).toBe(true);
  });

  it('rejects arbitrary or terminal reversals', () => {
    expect(isLegalReturnTransition(ReturnStatus.REQUESTED, ReturnStatus.RESOLVED)).toBe(false);
    expect(isLegalReturnTransition(ReturnStatus.REJECTED, ReturnStatus.APPROVED)).toBe(false);
    expect(isLegalReturnTransition(ReturnStatus.RESOLVED, ReturnStatus.REQUESTED)).toBe(false);
  });
});