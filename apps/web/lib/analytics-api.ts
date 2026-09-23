const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
  return body?.data as T;
}

export type AnalyticsPeriod = { from: string; to: string; timezone: string };

export type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear';

export type AnalyticsQuery = { preset?: PresetKey; from?: string; to?: string; compare?: boolean; limit?: number };

export function queryString(query: AnalyticsQuery): string {
  const params = new URLSearchParams();
  if (query.preset) params.set('preset', query.preset);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.compare) params.set('compare', 'true');
  if (query.limit) params.set('limit', String(query.limit));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function getAnalyticsOverview(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/overview${queryString(query)}`);
}

export function getSalesAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/sales${queryString(query)}`);
}

export function getProductAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/products${queryString(query)}`);
}

export function getCategoryAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/categories${queryString(query)}`);
}

export function getCustomerAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/customers${queryString(query)}`);
}

export function getInventoryAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/inventory${queryString(query)}`);
}

export function getPaymentAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/payments${queryString(query)}`);
}

export function getFulfillmentAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/fulfillment${queryString(query)}`);
}

export function getDeliveryAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/delivery${queryString(query)}`);
}

export function getReturnAnalytics(query: AnalyticsQuery) {
  return request<Record<string, unknown>>(`/admin/analytics/returns${queryString(query)}`);
}

export function getDataQuality() {
  return request<{ issues: Array<{ key: string; title: string; severity: string; count: number; samples: string[] }> }>('/admin/analytics/quality');
}

export function getMetricDefinitions() {
  return request<{ timezone: string; metrics: Array<{ metric: string; definition: string; formula: string; source: string; dateBasis: string; exclusions: string; limitations: string }> }>('/admin/analytics/definitions');
}

export async function exportReport(report: string, query: AnalyticsQuery & { exportLimit?: number }): Promise<{ filename: string; csv: string }> {
  const params = new URLSearchParams();
  if (query.preset) params.set('preset', query.preset);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.exportLimit) params.set('exportLimit', String(query.exportLimit));
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/analytics/export/${report}?${params.toString()}`, { credentials: 'include' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Export failed.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `jb-${report}.csv`;
  return { filename, csv: await response.text() };
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
