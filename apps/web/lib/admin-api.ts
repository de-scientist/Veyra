const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string; code?: string; details?: unknown } } | null;
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
    (error as Error & { code?: string }).code = body?.error?.code;
    // Structured backend failures (e.g. PRODUCT_NOT_READY_FOR_PUBLISH issues,
    // DRAFT_CONFLICT canonical state) travel on `details` per the API error
    // contract — preserved here so callers can render actionable UI.
    (error as Error & { details?: unknown }).details = body?.error?.details;
    throw error;
  }
  return body?.data as T;
}

export type ApiErrorDetails = { issues?: Array<{ field: string; code: string; message: string }>; product?: { updatedAt?: string } & Record<string, unknown> };

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

export function isSuperAdminRole(roles: string[]) {
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

export type ProductCollectionEntry = { id: string; name: string; slug: string };

/** Canonical collection membership (server-authoritative replace semantics). */
export function getProductCollections(productId: string) {
  return request<{ collections: ProductCollectionEntry[] }>(`/admin/products/${productId}/collections`);
}

export function setProductCollections(productId: string, collectionIds: string[]) {
  return request<{ collections: ProductCollectionEntry[] }>(`/admin/products/${productId}/collections`, {
    method: 'PUT',
    body: JSON.stringify({ collectionIds }),
  });
}

export type DraftSaveResult = AdminProduct & { updatedAt: string };

/**
 * Server-backed draft save. The endpoint accepts basic fields only — it can
 * never transition status — and supports `expectedUpdatedAt` optimistic
 * concurrency (stale writes get 409 DRAFT_CONFLICT + canonical state).
 */
export function saveProductDraft(
  id: string,
  input: { name?: string; description?: string; categoryId?: string | null; expectedUpdatedAt?: string },
) {
  return request<DraftSaveResult>(`/admin/products/${id}/draft`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function createAdminVariant(productId: string, input: { sku: string; name?: string; status?: string; price: number; compareAtPrice?: number; attributeValues?: Array<{ attributeId: string; value: string }> }) {
  return request<{ id: string; sku: string }>(`/admin/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateAdminVariant(productId: string, variantId: string, input: { name?: string; status?: string; price?: number; compareAtPrice?: number | null }) {
  return request<{ id: string }>(`/admin/products/${productId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export type VariantGenerationSummary = { id: string | null; sku: string; attributes: Record<string, string> };

export type VariantGenerationResult = {
  created: VariantGenerationSummary[];
  existing: VariantGenerationSummary[];
  skipped: VariantGenerationSummary[];
  errors: Array<{ code: string; message: string }>;
  summary: { created: number; existing: number; skipped: number; errors: number };
};

export type VariantGenerationInput = {
  attributes: Record<string, string[]>;
  allowList?: Array<Record<string, string>>;
  price?: number;
  compareAtPrice?: number;
  brandCode?: string;
  brandValueId?: string;
  categoryCode?: string;
  styleCode?: string;
  dryRun?: boolean;
};

/**
 * Phase 2 variant-generation engine. dryRun previews authoritative SKUs
 * without persisting; live calls create missing variants atomically and
 * report existing ones (idempotent — never duplicates).
 */
export function generateProductVariants(productId: string, input: VariantGenerationInput) {
  return request<VariantGenerationResult>(`/admin/products/${productId}/variants/generate`, { method: 'POST', body: JSON.stringify(input) });
}

/** Bulk price/status update for the variant matrix — one transaction, not N requests. */
export function batchUpdateVariants(productId: string, input: { variants: Array<{ id: string; name?: string; status?: string; price?: number; compareAtPrice?: number | null }> }) {
  return request<Array<{ id: string }>>(`/admin/products/${productId}/variants`, { method: 'PATCH', body: JSON.stringify(input) });
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

export type AdminCategory = { id: string; name: string; slug: string; description: string | null; parentId: string | null; status: string; code: string | null; skuTemplate: string | null; _count: { products: number } };
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

export function deleteAdminCategory(id: string) {
  return request<AdminCategory>(`/admin/categories/${id}`, { method: 'DELETE' });
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

export function deleteAdminCollection(id: string) {
  return request<{ deleted: boolean }>(`/admin/collections/${id}`, { method: 'DELETE' });
}

export type AdminProductDetailVariant = {
  id: string;
  sku: string;
  name: string | null;
  status: string;
  barcode: string | null;
  priceOverride: number | null;
  compareAtPrice: number | null;
  inventory: { quantityOnHand: number; quantityReserved: number; lowStockThreshold: number } | null;
  variantAttributeValues: Array<{ attributeId: string; attributeValueId: string; attribute: { id: string; name: string; slug: string }; attributeValue: { id: string; value: string } }>;
};

export type AdminProductDetail = {
  id: string; name: string; slug: string; description: string | null; status: string; categoryId: string | null;
  basePrice: number | null; styleCode: string | null;
  category: { id: string; name: string; slug: string; code: string | null; skuTemplate: string | null } | null;
  variants: AdminProductDetailVariant[];
  images: Array<{ id: string; url: string; altText: string | null }>;
};

export function getAdminProduct(id: string) {
  return request<AdminProductDetail>(`/admin/products/${id}`);
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

export function updateAdminAttribute(id: string, input: { name?: string; type?: string }) {
  return request<AdminAttribute>(`/admin/attributes/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteAdminAttribute(id: string) {
  return request<{ deleted: boolean }>(`/admin/attributes/${id}`, { method: 'DELETE' });
}

export function deleteAdminAttributeValue(valueId: string) {
  return request<{ deleted: boolean }>(`/admin/attributes/values/${valueId}`, { method: 'DELETE' });
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

/** Bulk restock for the variant matrix — one transaction, not N requests. */
export function restockVariantsBatch(input: { reason?: string; items: Array<{ variantId: string; quantity: number; lowStockThreshold?: number }> }) {
  return request<Array<{ variantId: string; quantityOnHand: number }>>('/admin/inventory/restock-batch', { method: 'POST', body: JSON.stringify(input) });
}

// ---- Barcodes (Phase 5; operations staff only; backend is authoritative) ----

export type BarcodeLookupResult = {
  variant: { id: string; sku: string; name: string | null; status: string; barcode: string | null; price: number | null };
  product: { id: string; name: string; slug: string; status: string };
  attributes: Record<string, string>;
  inventory: { quantityOnHand: number; quantityReserved: number; availableQuantity: number; lowStockThreshold: number } | null;
};

/** Server-generated internal barcode (EAN-13, restricted-circulation 29 prefix). */
export function generateVariantBarcode(productId: string, variantId: string) {
  return request<{ barcode: string; type: string }>(`/admin/products/${productId}/variants/${variantId}/barcode/generate`, { method: 'POST' });
}

/** Manual assignment (manufacturer/supplier/imported/manual codes, strictly validated). */
export function assignVariantBarcode(productId: string, variantId: string, input: { barcode: string; type?: string; source?: string; replace?: boolean; reason?: string }) {
  return request<{ barcode: string; type: string; source: string }>(`/admin/products/${productId}/variants/${variantId}/barcode/assign`, { method: 'POST', body: JSON.stringify(input) });
}

/** Bulk generation for barcode-less variants only — existing codes never touched. */
export function generateMissingBarcodes(productId: string, input?: { limit?: number }) {
  return request<{ generated: Array<{ variantId: string; sku: string; barcode: string }>; skipped: number; errors: Array<{ variantId: string; code: string; message: string }> }>(
    `/admin/products/${productId}/variants/barcodes/generate-missing`,
    { method: 'POST', body: JSON.stringify(input ?? {}) },
  );
}

/** Scanner/keyboard lookup: barcode → variant + SKU + inventory. */
export function lookupVariantByBarcode(barcode: string) {
  return request<BarcodeLookupResult>(`/admin/inventory/lookup?barcode=${encodeURIComponent(barcode)}`);
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

/**
 * Cancel an unpaid order (Phase 4): releases ACTIVE reservations
 * idempotently. Paid/fulfilled orders are refused — use returns/refunds.
 */
export function cancelAdminOrder(orderNumber: string, input: { reason: string }) {
  return request<{ orderNumber: string; status: string; releasedReservations: number; alreadyCancelled: boolean }>(
    `/admin/orders/${encodeURIComponent(orderNumber)}/cancel`,
    { method: 'POST', body: JSON.stringify(input) },
  );
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

// ---- User & role administration (super-admin only; backend enforces) ----

export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
  roles: string[];
};

export function getAdminUsers(params?: { page?: number; pageSize?: number; search?: string; status?: string; role?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.role) searchParams.set('role', params.role);
  return request<{ users: AdminUser[]; pagination: Pagination }>(`/admin/users?${searchParams.toString()}`);
}

export type AdminUserDetail = Omit<AdminUser, 'roles'> & {
  phone: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  roles: Array<{ id: string; name: string; slug: string }>;
};

export function getAdminUserDetail(id: string) {
  return request<AdminUserDetail>(`/admin/users/${id}`);
}

export function changeUserRole(id: string, input: { role: string; action: 'assign' | 'revoke' }) {
  return request<{ roles: string[] }>(`/admin/users/${id}/roles`, { method: 'POST', body: JSON.stringify(input) });
}

export type AdminRole = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  permissions: string[];
};

export function getAdminRoles() {
  return request<{ roles: AdminRole[] }>('/admin/roles');
}
