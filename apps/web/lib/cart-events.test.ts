import { afterEach, describe, expect, it, vi } from 'vitest';

import { CART_UPDATED_EVENT, WISHLIST_UPDATED_EVENT, notifyCartUpdated, notifyWishlistUpdated } from './shopping-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cart update event', () => {
  it('exposes a stable event name for header/cart synchronization', () => {
    expect(CART_UPDATED_EVENT).toBe('jb:cart-updated');
  });

  it('dispatches the event when a window is present', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent } as unknown as Window & typeof globalThis);
    notifyCartUpdated();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as CustomEvent).type).toBe(CART_UPDATED_EVENT);
  });

  it('is a safe no-op during server-side rendering', () => {
    expect(() => notifyCartUpdated()).not.toThrow();
  });
});

describe('wishlist update event', () => {
  it('exposes a stable event name for header/card synchronization', () => {
    expect(WISHLIST_UPDATED_EVENT).toBe('jb:wishlist-updated');
  });

  it('dispatches the event when a window is present', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent } as unknown as Window & typeof globalThis);
    notifyWishlistUpdated();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect((dispatchEvent.mock.calls[0][0] as CustomEvent).type).toBe(WISHLIST_UPDATED_EVENT);
  });

  it('is a safe no-op during server-side rendering', () => {
    expect(() => notifyWishlistUpdated()).not.toThrow();
  });
});
