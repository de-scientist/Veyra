import { describe, expect, it } from 'vitest';

import { normalizeManualReference, validateManualReference } from './manual.js';
import { HttpError } from '../errors.js';

describe('manual M-Pesa reference validation', () => {
  it('normalizes codes (trim, uppercase, strip inner spaces)', () => {
    expect(normalizeManualReference('  qhx123abc ')).toBe('QHX123ABC');
    expect(normalizeManualReference('qhx 123 abc')).toBe('QHX123ABC');
  });

  it('accepts 6–12 letter/number codes', () => {
    expect(validateManualReference('QHX123ABC')).toBe('QHX123ABC');
    expect(validateManualReference('qhx123abc')).toBe('QHX123ABC');
    expect(validateManualReference('ABCDEF')).toBe('ABCDEF');
  });

  it('rejects blank codes with MANUAL_REFERENCE_REQUIRED', () => {
    try {
      validateManualReference('   ');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe('MANUAL_REFERENCE_REQUIRED');
    }
  });

  it('rejects malformed codes with MANUAL_REFERENCE_INVALID', () => {
    for (const bad of ['ABC12', 'QHX-123-ABC', 'QHX!!!', 'A'.repeat(13), 'SHORT']) {
      try {
        validateManualReference(bad);
        expect.unreachable(`accepted ${bad}`);
      } catch (error) {
        expect((error as HttpError).code).toBe('MANUAL_REFERENCE_INVALID');
      }
    }
  });
});
