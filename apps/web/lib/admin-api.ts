const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
    (error as Error & { code?: string }).code = body?.error?.code;
    throw error;
  }
  return body?.data as T;
}

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

export type SessionUser = {
  // Safe subset of GET /auth/me: display fields only. The backend already
  // serializes `avatarUrl`; no API change was needed for Phase B.
  user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; avatarUrl: string | null; status: string };
  roles: string[];
};

export function isOperationsRole(roles: string[]) {
  return roles.some((role) => ['staff', 'admin', 'super_admin', 'super-admin'].includes(role.toLowerCase()));
}

function isAdminRole(roles: string[]) {
  return roles.some((role) => ['admin', 'super_admin', 'super-admin'].includes(role.toLowerCase()));
}

function isSuperAdminRole(roles: string[]) {
  return roles.some((role) => ['super_admin', 'super-admin'].includes(role.toLowerCase()));
}

/**
 * Centralized frontend permission helper. UX-only: every permission is
 * re-enforced by the backend on each request. Unknown permissions deny.
 */
export function can(permission: string, roles: string[]): boolean {
  switch (permission.toLowerCase()) {
    case 'dashboard.read':
      return isOperationsRole(roles);
    case 'refunds.process':
    case 'customers.manage':
    case 'users.manage':
    case 'settings.manage':
      return isAdminRole(roles);
    case 'roles.manage':
      return isSuperAdminRole(roles);
    default:
      return false;
  }
}

export function getSessionUser() {
  return request<SessionUser>('/auth/me');
}

export function logout() {
  return request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' });
}

// ---- Dashboard ----

export type AdminDashboard = {
  commerce: { ordersToday: number; ordersWeek: number; paidOrders: number; unpaidOrders: number; cancelledOrders: number; paidOrderValue: number; currency: string };
  operations: { unfulfilledPaidOrders: number; failedDeliveries: number; pendingReturns: number; pendingRefunds: number; failedPayments: number };
  inventory: { activeProducts: number; activeVariants: number; lowStockVariants: number; outOfStockVariants: number; activeReservations: number };
  customers: { registeredCustomers: number; guestOrders: number };
  needsAttention: { pendingPayments: number; unfulfilledPaidOrders: number; failedDeliveries: number; returnsAwaitingReview: number; refundsAwaitingAction: number; lowStockVariants: number };
};

export function getAdminDashboard() {
  return request<AdminDashboard>('/admin/dashboard');
}

// ---- Products ----

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  variants: Array<{ id: string; sku: string; status: string; priceOverride: number | null }>;
  _count: { variants: number };
};

export function getAdminProducts(params?: { page?: number; pageSize?: number; search?: string; status?: string; categoryId?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.categoryId) searchParams.set('categoryId', params.categoryId);
  return request<{ products: AdminProduct[]; pagination: Pagination }>(`/admin/products?${searchParams.toString()}`);
}

export function createAdminProduct(input: { name: string; description: string; categoryId?: string; slug?: string; status?: string }) {
  return request<AdminProduct>('/admin/products', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminProduct(id: string, input: { name?: string; description?: string; categoryId?: string | null; status?: string }) {
  return request<AdminProduct>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function createAdminVariant(productId: string, input: { sku: string; name?: string; status?: string; price: number; compareAtPrice?: number; attributeValues?: Array<{ attributeId: string; value: string }> }) {
  return request<{ id: string; sku: string }>(`/admin/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminVariant(productId: string, variantId: string, input: { name?: string; status?: string; price?: number; compareAtPrice?: number | null }) {
  return request<{ id: string }>(`/admin/products/${productId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Product images (Phase D) ----

export type AdminProductImage = {
  id: string;
  productId: string;
  variantId: string | null;
  url: string;
  publicId: string | null;
  secureUrl: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  providerCleanup?: 'deleted' | 'failed' | 'skipped';
};

export type AdminProductImageInput = {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
  altText?: string;
  variantId?: string;
};

export function getAdminProductImages(productId: string) {
  return request<AdminProductImage[]>(`/admin/products/${productId}/images`);
}

export function createAdminProductImage(productId: string, input: AdminProductImageInput) {
  return request<AdminProductImage>(`/admin/products/${productId}/images`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminProductImage(productId: string, imageId: string, input: { altText: string | null }) {
  return request<AdminProductImage>(`/admin/products/${productId}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function setPrimaryAdminProductImage(productId: string, imageId: string) {
  return request<AdminProductImage[]>(`/admin/products/${productId}/images/${imageId}/primary`, { method: 'POST' });
}

export function reorderAdminProductImages(productId: string, imageIds: string[]) {
  return request<AdminProductImage[]>(`/admin/products/${productId}/images/reorder`, { method: 'PATCH', body: JSON.stringify({ imageIds }) });
}

export function replaceAdminProductImage(productId: string, imageId: string, input: AdminProductImageInput) {
  return request<AdminProductImage>(`/admin/products/${productId}/images/${imageId}/replace`, { method: 'POST', body: JSON.stringify(input) });
}

export function deleteAdminProductImage(productId: string, imageId: string) {
  return request<{ images: AdminProductImage[]; providerCleanup: 'deleted' | 'failed' | 'skipped' }>(
    `/admin/products/${productId}/images/${imageId}`,
    { method: 'DELETE' },
  );
}

// ---- Categories / collections / attributes ----

export type AdminCategory = { id: string; name: string; slug: string; description: string | null; parentId: string | null; status: string; _count: { products: number } };
export type AdminCollection = { id: string; name: string; slug: string; description: string | null; status: string; _count: { products: number } };
export type AdminAttribute = { id: string; name: string; slug: string; type: string; values: Array<{ id: string; value: string }> };

export function getAdminCategories() {
  return request<AdminCategory[]>('/admin/categories');
}

export function createAdminCategory(input: { name: string; slug?: string; description?: string; parentId?: string | null }) {
  return request<AdminCategory>('/admin/categories', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminCategory(id: string, input: { name?: string; slug?: string; description?: string; parentId?: string | null }) {
  return request<AdminCategory>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function getAdminCollections() {
  return request<AdminCollection[]>('/admin/collections');
}

export function createAdminCollection(input: { name: string; slug?: string; description?: string; status?: string }) {
  return request<AdminCollection>('/admin/collections', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminCollection(id: string, input: { name?: string; slug?: string; description?: string; status?: string }) {
  return request<AdminCollection>(`/admin/collections/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function getAdminAttributes() {
  return request<AdminAttribute[]>('/admin/attributes');
}

export function createAdminAttribute(input: { name: string; type?: string }) {
  return request<AdminAttribute>('/admin/attributes', { method: 'POST', body: JSON.stringify(input) });
}

export function createAdminAttributeValue(attributeId: string, value: string) {
  return request<{ id: string }>(`/admin/attributes/${attributeId}/values`, { method: 'POST', body: JSON.stringify({ value }) });
}

// ---- Inventory ----

export type AdminInventoryRow = {
  id: string;
  variantId: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  availableQuantity: number;
  variant: { id: string; sku: string; name: string | null; status: string; product: { id: string; name: string; slug: string; status: string } };
};

export function getAdminInventory(params?: { page?: number; pageSize?: number; search?: string; lowStock?: boolean; outOfStock?: boolean }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.lowStock) searchParams.set('lowStock', 'true');
  if (params?.outOfStock) searchParams.set('outOfStock', 'true');
  return request<{ inventory: AdminInventoryRow[]; pagination: Pagination }>(`/admin/inventory?${searchParams.toString()}`);
}

export function restockVariant(variantId: string, input: { quantity: number; lowStockThreshold?: number; reason?: string }) {
  return request<AdminInventoryRow>(`/admin/inventory/${variantId}/restock`, { method: 'POST', body: JSON.stringify(input) });
}

export function adjustVariant(variantId: string, input: { delta: number; reason: string }) {
  return request<AdminInventoryRow>(`/admin/inventory/${variantId}/adjust`, { method: 'POST', body: JSON.stringify(input) });
}

export function getInventoryMovements(params?: { page?: number; pageSize?: number; search?: string; movementType?: string; variantId?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.movementType) searchParams.set('movementType', params.movementType);
  if (params?.variantId) searchParams.set('variantId', params.variantId);
  return request<{ movements: Array<{ id: string; movementType: string; quantity: number; reason: string; referenceType: string | null; referenceId: string | null; note: string | null; actorId: string | null; createdAt: string; variant: { id: string; sku: string; product: { name: string } } }>; pagination: Pagination }>(
    `/admin/inventory/movements?${searchParams.toString()}`,
  );
}

export function getInventoryReservations(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  return request<{ reservations: Array<{ id: string; quantity: number; status: string; createdAt: string; expiresAt: string | null; variant: { id: string; sku: string }; order: { id: string; orderNumber: string } }>; pagination: Pagination }>(
    `/admin/inventory/reservations?${searchParams.toString()}`,
  );
}

// ---- Orders ----

export type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: number;
  currency: string;
  customerName: string | null;
  customerEmail: string | null;
  userId: string | null;
  createdAt: string;
  itemCount: number;
};

export function getAdminOrders(params?: { page?: number; pageSize?: number; search?: string; status?: string; paymentStatus?: string; fulfillmentStatus?: string; from?: string; to?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.paymentStatus) searchParams.set('paymentStatus', params.paymentStatus);
  if (params?.fulfillmentStatus) searchParams.set('fulfillmentStatus', params.fulfillmentStatus);
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  return request<{ orders: AdminOrderSummary[]; pagination: Pagination }>(`/admin/orders?${searchParams.toString()}`);
}

export function getAdminOrderDetail(orderNumber: string) {
  return request<Record<string, unknown>>(`/admin/orders/${encodeURIComponent(orderNumber)}`);
}

// ---- Payments ----

export function getAdminPayments(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  return request<{ payments: Array<Record<string, unknown>>; pagination: Pagination }>(`/admin/payments?${searchParams.toString()}`);
}

// ---- Customers ----

export type AdminCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
};

export function getAdminCustomers(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  return request<{ customers: AdminCustomer[]; pagination: Pagination }>(`/admin/customers?${searchParams.toString()}`);
}

export function getAdminCustomerDetail(id: string) {
  return request<Record<string, unknown>>(`/admin/customers/${id}`);
}

export function updateAdminCustomer(id: string, input: { firstName?: string; lastName?: string; phone?: string | null; status?: string }) {
  return request<AdminCustomer>(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Audit logs ----

export function getAuditLogs(params?: { page?: number; pageSize?: number; search?: string; action?: string; entity?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.action) searchParams.set('action', params.action);
  if (params?.entity) searchParams.set('entity', params.entity);
  return request<{ logs: Array<{ id: string; actorId: string | null; action: string; entity: string; entityId: string; before: unknown; after: unknown; ipAddress: string | null; createdAt: string; actor: { id: string; email: string; firstName: string; lastName: string } | null }>; pagination: Pagination }>(
    `/admin/audit-logs?${searchParams.toString()}`,
  );
}

// ---- Reviews ----

export function getAdminReviews(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  return request<{ reviews: Array<Record<string, unknown>>; pagination: Pagination }>(`/admin/reviews?${searchParams.toString()}`);
}

export function moderateReview(id: string, input: { status: string; reason?: string }) {
  return request<Record<string, unknown>>(`/admin/reviews/${id}/moderate`, { method: 'POST', body: JSON.stringify(input) });
}

// ---- Coupons ----

export function getAdminCoupons(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  return request<{ coupons: Array<Record<string, unknown>>; pagination: Pagination }>(`/admin/coupons?${searchParams.toString()}`);
}

export function createAdminCoupon(input: { code: string; discountType?: string; value: number; status?: string; validFrom?: string; validUntil?: string; maxUses?: number }) {
  return request<Record<string, unknown>>('/admin/coupons', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminCoupon(id: string, input: { status?: string; maxUses?: number | null; validUntil?: string | null }) {
  return request<Record<string, unknown>>(`/admin/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

// ---- Settings ----

export function getAdminSettings() {
  return request<Record<string, unknown>>('/admin/settings');
}
