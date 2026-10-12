import { describe, expect, it } from 'vitest';

import {
  PRODUCT_SUCCESS,
  VARIANT_REQUIRED,
  toProductError,
  toProductErrorFromEnvelope,
} from './product-feedback';

function coded(code: string, message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

describe('product success copy', () => {
  it('uses the specified cart and wishlist titles', () => {
    expect(PRODUCT_SUCCESS.addedToCart.title).toBe('Added to cart');
    expect(PRODUCT_SUCCESS.addedToCart.description).toContain('successfully');
    expect(PRODUCT_SUCCESS.wishlistAdded.title).toBe('Wishlist updated');
    expect(PRODUCT_SUCCESS.wishlistRemoved.description).toContain('removed');
  });

  it('uses the specified variant-required copy', () => {
    expect(VARIANT_REQUIRED.title).toBe('Choose an option');
    expect(VARIANT_REQUIRED.retryable).toBe(false);
  });
});

describe('toProductError', () => {
  it('maps unauthenticated failures to sign-in', () => {
    expect(toProductError(coded('UNAUTHENTICATED', 'Unauthorized'))).toMatchObject({
      title: 'Sign in required',
      retryable: false,
    });
  });

  it('maps stock failures to unavailable without retry', () => {
    expect(toProductError(coded('OUT_OF_STOCK', 'Insufficient stock'))).toMatchObject({
      title: 'Product unavailable',
      retryable: false,
    });
  });

  it('maps network failures to connection message with retry', () => {
    expect(toProductError(new TypeError('Failed to fetch'))).toMatchObject({
      title: 'Unable to complete action',
      retryable: true,
    });
  });

  it('surfaces safe backend validation messages verbatim', () => {
    const feedback = toProductError(coded('VALIDATION', 'Only 2 left in stock'));
    expect(feedback.title).toBe('Unable to add product');
    expect(feedback.description).toBe('Only 2 left in stock');
    expect(feedback.retryable).toBe(false);
  });

  it('never leaks SQL/internals to shoppers', () => {
    const feedback = toProductError(new Error('Prisma P2002 column constraint failed at /app/src/cart.ts:10:5'));
    expect(feedback.title).toBe('Something went wrong');
    expect(feedback.description).not.toMatch(/prisma|column|constraint/i);
    expect(feedback.retryable).toBe(true);
  });

  it('falls back to a safe generic message for unknown shapes', () => {
    expect(toProductError(null)).toMatchObject({ title: 'Something went wrong', retryable: true });
    expect(toProductError(undefined)).toMatchObject({ title: 'Something went wrong' });
  });

  it('supports envelope input with wishlist context titles', () => {
    const feedback = toProductErrorFromEnvelope({ code: 'VALIDATION', message: 'x'.repeat(500) }, 'wishlist');
    expect(feedback.title).toBe('Unable to update wishlist');
  });
});
