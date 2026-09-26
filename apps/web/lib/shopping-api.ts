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
  items: Array<{ id: string; productName: string; sku: string; variantDescription: string | null; quantity: number; unitPrice: number; subtotal: number; total: number }>;
};

export type Payment = {
  id: string;
  orderNumber: string;
  provider: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  amount: number;
  currency: string;
  providerReference: string | null;
  paidAt: string | null;
};

export type Delivery = {
  id: string;
  orderNumber: string;
  status: string;
  trackingNumber: string | null;
  internalReference: string;
  provider: string | null;
  estimatedDeliveryAt: string | null;
  shippedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  method: { id: string; name: string; type: string } | null;
  zone: { code: string; name: string } | null;
  assignee: { id: string; firstName: string; lastName: string; email: string } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
};

export type ReturnRequest = {
  id: string;
  returnNumber: string;
  orderNumber: string;
  type: 'REFUND' | 'EXCHANGE';
  status: string;
  reason: string;
  customerNote: string | null;
  requestedAt: string;
  items: Array<{ id: string; orderItemId: string; productName: string; sku: string; variantDescription: string | null; quantity: number; reason: string; condition: string; disposition: string | null; refundAmount: number }>;
  refund: { refundNumber: string; amount: number; currency: string; status: string; providerReference: string | null } | null;
  exchange: { status: string; replacementVariantId: string; quantity: number } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
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

// Account types
export type AccountProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountAddress = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountOrderItem = {
  id: string;
  productName: string;
  sku: string;
  variantDescription: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  total: number;
  productImage: string | null;
};

export type AccountOrderDelivery = {
  id: string;
  status: string;
  trackingNumber: string | null;
  estimatedDeliveryAt: string | null;
  shippedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  method: { name: string; type: string } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
};

export type AccountOrderPayment = {
  id: string;
  status: string;
  amount: number;
  provider: string;
  providerReference: string | null;
  paidAt: string | null;
};

export type AccountOrder = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  itemCount: number;
  items: AccountOrderItem[];
  delivery: AccountOrderDelivery | null;
  payment: AccountOrderPayment | null;
};

export type OrderSummary = {
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: number;
  currency: string;
  itemCount: number;
};

export type AccountPayment = {
  id: string;
  orderNumber: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type AccountReturnItem = {
  id: string;
  orderItemId: string;
  productName: string;
  sku: string;
  variantDescription: string | null;
  quantity: number;
  reason: string;
  condition: string;
  disposition: string | null;
  refundAmount: number;
};

export type AccountReturn = {
  id: string;
  returnNumber: string;
  orderNumber: string;
  type: 'REFUND' | 'EXCHANGE';
  status: string;
  reason: string;
  customerNote: string | null;
  requestedAt: string;
  items: AccountReturnItem[];
  refund: { refundNumber: string; amount: number; currency: string; status: string; providerReference: string | null } | null;
  exchange: { status: string; replacementVariantId: string; quantity: number } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
};

export type AccountRefund = {
  id: string;
  refundNumber: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  reason: string;
  requestedAt: string;
  processedAt: string | null;
};

export type AccountSession = {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
};

export type AccountPreferences = {
  id: string;
  userId: string;
  emailOrderUpdates: boolean;
  emailDelivery: boolean;
  emailReturns: boolean;
  emailMarketing: boolean;
  updatedAt: string;
};

export type DashboardData = {
  profile: AccountProfile;
  orderSummary: { totalOrders: number; activeOrders: number; deliveredOrders: number; processingOrders: number };
  currentOrder: AccountOrder | null;
  recentOrders: OrderSummary[];
  wishlist: { count: number; items: Array<{ productId: string; product: { name: string; slug: string; image: string | null; price: number; availability: string } }> } | null;
  activeReturns: { count: number; latest: AccountReturn | null };
  recentRefunds: { count: number; latest: AccountRefund | null };
};

export type PaginatedOrders = {
  orders: OrderSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type ReorderResult = {
  orderNumber: string;
  results: Array<{ orderItemId: string; productName: string; sku: string; added: boolean; reason?: string; currentPrice?: number; currentStock?: number }>;
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

/**
 * Event dispatched (same-tab) after any cart mutation, so the header cart
 * count and any cart views refresh without a full page reload. Same pattern
 * as `jb:session-updated` in `lib/session.tsx` — no second cart store, no
 * new state library: the backend stays authoritative and listeners re-fetch.
 */
export const CART_UPDATED_EVENT = 'jb:cart-updated';

export function notifyCartUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
  }
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

export type CheckoutFormState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethodId: string;
  shippingZoneCode: string;
  addressId: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
};

/**
 * Builds the POST /checkout/preview (and POST /checkout) body from checkout
 * form state. Blank optional selections are omitted — never sent as `''` —
 * so the backend validation contract distinguishes "not selected"
 * (`undefined` → controlled 400 "Select a delivery zone.") from a stale or
 * unknown zone code (409 "delivery zone is unavailable").
 */
export function buildCheckoutInput(
  form: CheckoutFormState,
  opts: { needsAddress: boolean; confirmPriceChanges: boolean },
): CheckoutInput {
  return {
    customerName: form.customerName,
    customerEmail: form.customerEmail,
    customerPhone: form.customerPhone,
    deliveryMethodId: form.deliveryMethodId,
    shippingZoneCode: form.shippingZoneCode || undefined,
    address: opts.needsAddress
      ? { line1: form.line1, city: form.city, state: form.state, postalCode: form.postalCode, country: form.country }
      : undefined,
    addressId: form.addressId || undefined,
    notes: form.notes || undefined,
    confirmPriceChanges: opts.confirmPriceChanges,
  };
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

export function initiateMpesaPayment(orderNumber: string, idempotencyKey: string, confirmationToken?: string) {
  return request<{ payment: Payment; transactionId: string; providerRequestId: string | null; customerMessage: string; replayed: boolean }>(`/payments/mpesa/initiate${confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : ''}`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey, ...(confirmationToken ? { 'x-confirmation-token': confirmationToken } : {}) },
    body: JSON.stringify({ orderNumber }),
  });
}

export function getPaymentStatus(paymentId: string, confirmationToken?: string) {
  const suffix = confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : '';
  return request<Payment>(`/payments/${encodeURIComponent(paymentId)}/status${suffix}`);
}

/**
 * Recovery probe for delayed/missing M-Pesa callbacks: asks the backend to
 * check the provider for the latest pending attempt. Never marks anything
 * paid client-side — the returned payment is still authoritative backend state.
 */
export function queryPaymentStatus(paymentId: string, confirmationToken?: string) {
  const suffix = confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : '';
  return request<{ payment: Payment; transactionId: string | null; refreshed: boolean; pending: boolean }>(`/payments/${encodeURIComponent(paymentId)}/query${suffix}`, { method: 'POST' });
}

export function getOrderDelivery(orderNumber: string, confirmationToken?: string) {
  const suffix = confirmationToken ? `?token=${encodeURIComponent(confirmationToken)}` : '';
  return request<Delivery>(`/orders/${encodeURIComponent(orderNumber)}/delivery${suffix}`);
}

export function getFulfillmentQueue(status?: string) {
  return request<Delivery[]>(`/admin/fulfillments${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

export function updateFulfillment(orderNumber: string, action: 'start' | 'pick' | 'pack') {
  return request<Delivery>(`/admin/fulfillments/${encodeURIComponent(orderNumber)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
}

export function updateDeliveryStatus(deliveryId: string, status: string) {
  return request<Delivery>(`/admin/deliveries/${encodeURIComponent(deliveryId)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

export function getOperationsUsers() {
  return request<Array<{ id: string; firstName: string; lastName: string; email: string }>>('/admin/operations-users');
}

export function assignDelivery(deliveryId: string, assigneeId: string) {
  return request<Delivery>(`/admin/deliveries/${encodeURIComponent(deliveryId)}/assign`, { method: 'POST', body: JSON.stringify({ assigneeId }) });
}

export function getReturns() {
  return request<ReturnRequest[]>('/returns');
}

export function createReturn(input: { orderNumber: string; type: 'REFUND' | 'EXCHANGE'; reason: string; customerNote?: string; items: Array<{ orderItemId: string; quantity: number; reason: string; replacementVariantId?: string }> }) {
  return request<ReturnRequest>('/returns', { method: 'POST', body: JSON.stringify(input) });
}

export function getReturnQueue(status?: string) {
  return request<ReturnRequest[]>(`/admin/returns${status ? `?status=${encodeURIComponent(status)}` : ''}`);
}

export function reviewReturn(returnId: string) {
  return request<ReturnRequest>(`/admin/returns/${returnId}/review`, { method: 'POST', body: JSON.stringify({}) });
}

export function approveReturn(returnId: string) {
  return request<ReturnRequest>(`/admin/returns/${returnId}/approve`, { method: 'POST', body: JSON.stringify({}) });
}

export function rejectReturn(returnId: string, reason: string) {
  return request<ReturnRequest>(`/admin/returns/${returnId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function receiveReturn(returnId: string) {
  return request<ReturnRequest>(`/admin/returns/${returnId}/receive`, { method: 'POST', body: JSON.stringify({}) });
}

export function inspectReturn(returnId: string, items: Array<{ returnItemId: string; condition: 'NEW' | 'LIKE_NEW' | 'USED' | 'DAMAGED' | 'DEFECTIVE' | 'UNSELLABLE' | 'UNKNOWN'; disposition: 'RESTOCK' | 'QUARANTINE' | 'DAMAGED' | 'UNSELLABLE' }>) {
  return request<ReturnRequest>(`/admin/returns/${returnId}/inspect`, { method: 'POST', body: JSON.stringify({ items }) });
}

export function requestRefund(returnId: string) {
  return request<{ refundNumber: string; amount: number; currency: string; status: string }>(`/admin/returns/${returnId}/refund`, { method: 'POST', body: JSON.stringify({ idempotencyKey: `refund-${returnId}` }) });
}

// Account API calls
export function getAccountDashboard() {
  return request<DashboardData>('/account');
}

export function getProfile() {
  return request<AccountProfile>('/account/profile');
}

export function updateProfile(input: { firstName?: string; lastName?: string; phone?: string | null }) {
  return request<AccountProfile>('/account/profile', { method: 'PATCH', body: JSON.stringify(input) });
}

export type AvatarFinalizeInput = {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
};

export function setProfileAvatar(input: AvatarFinalizeInput) {
  return request<AccountProfile & { providerCleanup: 'deleted' | 'failed' | 'skipped' }>('/account/profile/avatar', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeProfileAvatar() {
  return request<AccountProfile & { providerCleanup: 'deleted' | 'failed' | 'skipped' }>('/account/profile/avatar', {
    method: 'DELETE',
  });
}

export function getAddresses() {
  return request<AccountAddress[]>('/account/addresses');
}

export function createAddress(input: { label?: string; line1: string; line2?: string; city: string; state?: string; postalCode?: string; country?: string }) {
  return request<AccountAddress>('/account/addresses', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAddress(id: string, input: { label?: string; line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }) {
  return request<AccountAddress>(`/account/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAddress(id: string) {
  return request<{ deleted: boolean }>(`/account/addresses/${id}`, { method: 'DELETE' });
}

export function setDefaultAddress(id: string, type: 'shipping' | 'billing') {
  return request<AccountAddress>(`/account/addresses/${id}/default`, { method: 'POST', body: JSON.stringify({ type }) });
}

export function getOrders(params?: { page?: number; pageSize?: number; status?: string; search?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);
  return request<PaginatedOrders>(`/account/orders?${searchParams.toString()}`);
}

export function getOrderDetail(orderNumber: string) {
  return request<AccountOrder>(`/account/orders/${encodeURIComponent(orderNumber)}`);
}

export function getOrderTracking(orderNumber: string) {
  return request<{ orderNumber: string; status: string; fulfillmentStatus: string; trackingNumber: string | null; internalReference: string | null; courierProvider: string | null; method: { name: string; type: string } | null; zone: { code: string; name: string } | null; estimatedDeliveryAt: string | null; shippedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }> }>(`/account/orders/${encodeURIComponent(orderNumber)}/tracking`);
}

export function reorder(orderNumber: string) {
  return request<ReorderResult>(`/account/orders/${encodeURIComponent(orderNumber)}/reorder`, { method: 'POST' });
}

export function claimGuestOrder(orderNumber: string, token: string) {
  return request<{ orderNumber: string; claimed: boolean }>('/account/orders/claim', { method: 'POST', body: JSON.stringify({ orderNumber, token }) });
}

export function getPayments() {
  return request<AccountPayment[]>('/account/payments');
}

export function getAccountReturns() {
  return request<AccountReturn[]>('/account/returns');
}

export function getAccountReturnDetail(returnId: string) {
  return request<AccountReturn>(`/account/returns/${encodeURIComponent(returnId)}`);
}

export function getAccountWishlist() {
  return request<{ count: number; items: Array<{ id: string; productId: string; product: { name: string; slug: string; image: string | null } }> }>('/account/wishlist');
}

export function getRefunds() {
  return request<AccountRefund[]>('/account/refunds');
}

type SessionsEnvelope = { sessions: AccountSession[] };

/**
 * Backend contract: GET /account/security responds with
 * `{ success: true, data: { sessions: [...] } }`, so the shared `request`
 * helper resolves the envelope `{ sessions }` — not a bare array.
 * Normalization lives here (API-client layer) so the Security page always
 * receives a typed array. Unknown shapes resolve to `[]` instead of
 * crashing `sessions.filter` in the component.
 */
export async function getSessions(): Promise<AccountSession[]> {
  const data = await request<AccountSession[] | SessionsEnvelope>('/account/security');
  if (Array.isArray(data)) return data;
  if (data && Array.isArray((data as SessionsEnvelope).sessions)) return (data as SessionsEnvelope).sessions;
  return [];
}

export function changePassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  return request<{ changed: boolean }>('/account/security/password', { method: 'POST', body: JSON.stringify(input) });
}

export function revokeSession(id: string) {
  return request<{ revoked: boolean }>(`/account/sessions/${id}`, { method: 'DELETE' });
}

export function revokeOtherSessions() {
  return request<{ revoked: string }>('/account/sessions/others', { method: 'DELETE' });
}

export function getPreferences() {
  return request<AccountPreferences>('/account/preferences');
}

export function updatePreferences(input: { emailOrderUpdates?: boolean; emailDelivery?: boolean; emailReturns?: boolean; emailMarketing?: boolean }) {
  return request<AccountPreferences>('/account/preferences', { method: 'PATCH', body: JSON.stringify(input) });
}

export type CustomerNotification = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
};

export type PaginatedNotifications = {
  notifications: CustomerNotification[];
  unreadCount: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type NotificationPreferenceMatrix = Array<{
  category: string;
  channels: Array<{ channel: string; enabled: boolean; locked: boolean; explicit: boolean }>;
}>;

export function getNotifications(params?: { page?: number; pageSize?: number; category?: string; unreadOnly?: boolean }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.category) searchParams.set('category', params.category);
  if (params?.unreadOnly) searchParams.set('unreadOnly', 'true');
  return request<PaginatedNotifications>(`/account/notifications?${searchParams.toString()}`);
}

export function getUnreadCount() {
  return request<{ unreadCount: number }>('/account/notifications/unread-count');
}

export function markNotificationRead(id: string) {
  return request<{ read: boolean }>(`/account/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return request<{ marked: number }>('/account/notifications/read-all', { method: 'POST' });
}

export function getNotificationPreferences() {
  return request<NotificationPreferenceMatrix>('/account/notification-preferences');
}

export function updateNotificationPreference(input: { category: string; channel: string; enabled: boolean }) {
  return request<NotificationPreferenceMatrix>('/account/notification-preferences', { method: 'PATCH', body: JSON.stringify(input) });
}

export function deactivateAccount() {
  return request<{ deactivated: boolean }>('/account/deactivate', { method: 'POST' });
}

export function deleteAccount() {
  return request<{ deleted: boolean }>('/account/delete', { method: 'POST' });
}
