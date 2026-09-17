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
