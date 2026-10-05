import { describe, expect, it } from 'vitest';

import {
  JB_CONTACT_PHONE_DISPLAY,
  JB_CONTACT_PHONE_TEL,
  MPESA_ACCOUNT_NUMBER,
  MPESA_PAYBILL_NUMBER,
  copyToClipboard,
  isValidManualReference,
  manualReferenceError,
  normalizeManualReference,
} from './business-contact';

describe('business-contact central config', () => {
  it('exposes the exact business-provided values', () => {
    expect(JB_CONTACT_PHONE_DISPLAY).toBe('+254 741 298268');
    expect(JB_CONTACT_PHONE_TEL).toBe('tel:+254741298268');
    expect(MPESA_PAYBILL_NUMBER).toBe('400200');
    expect(MPESA_ACCOUNT_NUMBER).toBe('01116716087200');
  });

  it('normalizes manual references (trim + uppercase, no inner spaces)', () => {
    expect(normalizeManualReference('  qhx123abc ')).toBe('QHX123ABC');
    expect(normalizeManualReference('qhx 123 abc')).toBe('QHX123ABC');
  });

  it('validates manual reference format', () => {
    expect(isValidManualReference('QHX123ABC')).toBe(true);
    expect(isValidManualReference('qhx123abc')).toBe(true);
    expect(isValidManualReference('ABC12')).toBe(false);
    expect(isValidManualReference('QHX-123-ABC!!')).toBe(false);
    expect(isValidManualReference('')).toBe(false);
    expect(isValidManualReference('A'.repeat(13))).toBe(false);
  });

  it('returns accessible validation messages, null when valid', () => {
    expect(manualReferenceError('QHX123ABC')).toBeNull();
    expect(manualReferenceError('')).toMatch(/transaction code/i);
    expect(manualReferenceError('ABC')).toMatch(/6–12/);
    expect(manualReferenceError('QHX!!!')).toMatch(/letters and numbers/i);
  });

  it('copyToClipboard resolves false without a DOM clipboard (SSR-safe)', async () => {
    await expect(copyToClipboard('400200')).resolves.toBe(false);
  });
});
