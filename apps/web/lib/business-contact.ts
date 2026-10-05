/**
 * Central JB Mercantile business-contact + manual M-Pesa fallback config.
 *
 * Business-provided values (do not alter digits). All UI surfaces (header,
 * footer, checkout, order confirmation, admin) must import from here instead
 * of scattering magic strings. No database migration backs this — static
 * business configuration by design.
 */

export const JB_CONTACT_PHONE_DISPLAY = '+254 741 298268';
export const JB_CONTACT_PHONE_TEL = 'tel:+254741298268';
export const JB_CONTACT_PHONE_BARE = '+254741298268';

export const JB_DELIVERY_MESSAGE = 'We Deliver Across Kenya';
export const JB_DELIVERY_MESSAGE_SHORT = 'Delivering Across Kenya';

export const MPESA_PAYBILL_NUMBER = '400200';
export const MPESA_ACCOUNT_NUMBER = '01116716087200';
export const MPESA_POCHI_DISPLAY = '+254 741 298268';
export const MPESA_POCHI_TEL = 'tel:+254741298268';

/** M-Pesa transaction codes: 6–12 uppercase alphanumerics (e.g. QHX123ABC). */
const MANUAL_REFERENCE_PATTERN = /^[A-Z0-9]{6,12}$/;

export function normalizeManualReference(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidManualReference(input: string): boolean {
  return MANUAL_REFERENCE_PATTERN.test(normalizeManualReference(input));
}

export function manualReferenceError(input: string): string | null {
  const normalized = normalizeManualReference(input);
  if (!normalized) return 'Enter the M-Pesa transaction code from your confirmation message.';
  if (normalized.length < 6 || normalized.length > 12) {
    return 'Transaction codes are 6–12 characters long. Check your M-Pesa message and try again.';
  }
  if (!MANUAL_REFERENCE_PATTERN.test(normalized)) {
    return 'Transaction codes use letters and numbers only. Check your M-Pesa message and try again.';
  }
  return null;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy fallback below.
  }
  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
