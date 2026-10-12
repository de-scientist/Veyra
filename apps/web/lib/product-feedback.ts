/**
 * Product-card feedback copy (framework-free, unit-testable).
 *
 * Single ownership point for shopper-facing success/error titles +
 * descriptions used by card cart/wishlist actions. Error inputs come from
 * the shared API error contract (`{ code, message }` in
 * `lib/shopping-api.ts`) — this mapper never leaks stack traces, SQL,
 * status codes, or internal details; unknown shapes resolve to a safe
 * generic message. Retry is offered only when retrying is safe
 * (network/server failures — never validation or auth).
 */

export type FeedbackTone = 'success' | 'error' | 'info';

export type FeedbackMessage = {
  title: string;
  description: string;
  retryable: boolean;
};

export const PRODUCT_SUCCESS = {
  addedToCart: { title: 'Added to cart', description: 'Product added to your cart successfully.' },
  wishlistAdded: { title: 'Wishlist updated', description: 'Product added to your wishlist.' },
  wishlistRemoved: { title: 'Wishlist updated', description: 'Product removed from your wishlist.' },
} as const;

export const VARIANT_REQUIRED: FeedbackMessage = {
  title: 'Choose an option',
  description: 'Select the required product option before adding this item to your cart.',
  retryable: false,
};

type ErrorInput = {
  code?: string | null;
  message?: string | null;
};

/** Message fragments that are safe to surface verbatim from the backend. */
const SAFE_MESSAGE_PATTERNS: RegExp[] = [
  /out of stock/i,
  /only \d+ (left|available)/i,
  /not available/i,
  /unavailable/i,
  /quantity/i,
  /select .*(option|variant|size|color)/i,
  /sign in/i,
  /already in (cart|wishlist)/i,
  /product (not found|is unavailable)/i,
];

/** Fragments that must never reach shoppers (implementation leakage). */
const UNSAFE_PATTERNS: RegExp[] = [
  /prisma/i,
  /postgres/i,
  /sql/i,
  /stack/i,
  /at .*\(.*:\d+:\d+\)/,
  /500|P2002|P2025/,
  /column|constraint|relation|foreign key/i,
  /supabase/i,
  /vercel/i,
  /fetch failed/i,
];

function isSafeBackendMessage(message: string): boolean {
  if (UNSAFE_PATTERNS.some((re) => re.test(message))) return false;
  if (message.length > 160) return false;
  return SAFE_MESSAGE_PATTERNS.some((re) => re.test(message));
}

/**
 * Normalizes any thrown value into a safe, shopper-friendly message.
 * `context` selects the generic fallback title when nothing more specific
 * applies. Exactly one message is produced per failed action — callers must
 * not emit a second notification for the same failure.
 */
export function toProductError(error: unknown, context: 'cart' | 'wishlist' = 'cart'): FeedbackMessage {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '').toUpperCase()
      : '';
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED' || /sign in|unauthor/i.test(rawMessage)) {
    return {
      title: 'Sign in required',
      description: 'Sign in to continue with this action.',
      retryable: false,
    };
  }

  if (
    code === 'OUT_OF_STOCK' ||
    code === 'INSUFFICIENT_STOCK' ||
    /out of stock|insufficient stock|no longer available/i.test(rawMessage)
  ) {
    return {
      title: 'Product unavailable',
      description: 'This product is currently unavailable. Please check the available options.',
      retryable: false,
    };
  }

  if (code === 'VARIANT_REQUIRED' || code === 'VALIDATION' && /variant|option/i.test(rawMessage)) {
    return { ...VARIANT_REQUIRED };
  }

  if (
    code === 'VALIDATION' ||
    code === 'BAD_REQUEST' ||
    (rawMessage && isSafeBackendMessage(rawMessage))
  ) {
    return {
      title: context === 'cart' ? 'Unable to add product' : 'Unable to update wishlist',
      description: rawMessage && isSafeBackendMessage(rawMessage) ? rawMessage : 'Please check your selection and try again.',
      retryable: false,
    };
  }

  if (
    code === 'NETWORK' ||
    code === 'FETCH_ERROR' ||
    /failed to fetch|network|connection|timed out|timeout/i.test(rawMessage) ||
    error instanceof TypeError
  ) {
    return {
      title: 'Unable to complete action',
      description: 'Check your connection and try again.',
      retryable: true,
    };
  }

  if (!rawMessage || UNSAFE_PATTERNS.some((re) => re.test(rawMessage)) || rawMessage.length > 160) {
    return {
      title: 'Something went wrong',
      description: "We couldn't complete your request. Please try again.",
      retryable: true,
    };
  }

  return {
    title: 'Something went wrong',
    description: "We couldn't complete your request. Please try again.",
    retryable: true,
  };
}

/** Narrow helper for tests and direct `{ code, message }` envelopes. */
export function toProductErrorFromEnvelope(input: ErrorInput, context: 'cart' | 'wishlist' = 'cart'): FeedbackMessage {
  const error = new Error(input.message ?? '');
  if (input.code) (error as Error & { code?: string }).code = input.code;
  return toProductError(error, context);
}
