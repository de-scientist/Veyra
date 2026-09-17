const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type CartItem = {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  currentPrice: number;
  priceChanged: boolean;
  subtotal: number;
  availability: 'AVAILABLE' | 'LIMITED' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
  availableQuantity: number;
  product: { id: string; slug: string; name: string; image: string | null };
  variant: { id: string; name: string; sku: string; attributes: Record<string, string> };
};

export type Cart = { id: string; items: CartItem[]; itemCount: number; subtotal: number };

export type CheckoutInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethodId: string;
  shippingZoneCode?: string;
  address?: { line1: string; line2?: string; city: string; state?: string; postalCode?: string; country?: string };
  addressId?: string;
  notes?: string;
  confirmPriceChanges?: boolean;
};

export type CheckoutOptions = {
  methods: Array<{ id: string; name: string; code: string; type: 'PICKUP' | 'LOCAL_DELIVERY' | 'COURIER'; description: string | null }>;
  zones: Array<{ code: string; name: string; country: string; description: string | null }>;
};

export type CheckoutPreview = {
  items: Array<{ id: string; productName: string; variant: string; quantity: number; unitPrice: number; subtotal: number }>;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  shippingMethod: { id: string; name: string; type: string };
  shippingZone: { code: string; name: string };
  priceChangedItems: string[];
  requiresPriceConfirmation: boolean;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  delivery: { method: string; status: string } | null;
  items: Array<{ productName: string; sku: string; variantDescription: string | null; quantity: number; unitPrice: number; subtotal: number; total: number }>;
};

export type WishlistItem = {
  id: string;
  productId: string;
  product: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    image: string | null;
    price: number;
    availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
    hasVariantSelection: boolean;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
  return body?.data as T;
}

export function getCart() {
  return request<Cart>('/cart');
}

export function addToCart(variantId: string, quantity = 1) {
  return request<Cart>('/cart/items', { method: 'POST', body: JSON.stringify({ variantId, quantity }) });
}

export function updateCartItem(itemId: string, quantity: number) {
  return request<Cart>(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
}

export function removeCartItem(itemId: string) {
  return request<Cart>(`/cart/items/${itemId}`, { method: 'DELETE' });
}

export function clearCart() {
  return request<Cart>('/cart', { method: 'DELETE' });
}

export function getWishlist() {
  return request<{ id: string; items: WishlistItem[] }>('/wishlist');
}

export function addToWishlist(productId: string) {
  return request<{ id: string; items: WishlistItem[] }>('/wishlist/items', { method: 'POST', body: JSON.stringify({ productId }) });
}

export function removeWishlistItem(itemId: string) {
  return request<{ id: string; items: WishlistItem[] }>(`/wishlist/items/${itemId}`, { method: 'DELETE' });
}

export function getCheckoutOptions() {
  return request<CheckoutOptions>('/checkout/options');
}

export function previewCheckout(input: CheckoutInput) {
  return request<CheckoutPreview>('/checkout/preview', { method: 'POST', body: JSON.stringify(input) });
}

export function placeCheckout(input: CheckoutInput, idempotencyKey: string) {
  return request<{ order: Order; confirmationToken?: string; replayed: boolean; nextAction: string }>('/checkout', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function getSavedAddresses() {
  return request<Array<{ id: string; label: string | null; line1: string; line2: string | null; city: string; state: string | null; postalCode: string | null; country: string }>>('/checkout/saved-addresses');
}

export function getOrder(orderNumber: string, confirmationToken?: string) {
  const suffix = confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : '';
  return request<Order>(`/orders/${encodeURIComponent(orderNumber)}${suffix}`);
}
