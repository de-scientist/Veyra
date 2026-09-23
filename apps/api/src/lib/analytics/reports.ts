import { prisma } from '../prisma.js';
import { nairobiDayStart, type Period } from './periods.js';

export const EXPORT_DEFAULT_LIMIT = 1000;
export const EXPORT_MAX_LIMIT = 5000;

export type ReportKey = 'sales' | 'orders' | 'products' | 'inventory' | 'payments' | 'customers' | 'refunds';

export const REPORT_KEYS: ReportKey[] = ['sales', 'orders', 'products', 'inventory', 'payments', 'customers', 'refunds'];

export function clampExportLimit(limit: number | undefined): number {
  const value = Math.floor(limit ?? EXPORT_DEFAULT_LIMIT);
  if (!Number.isFinite(value) || value < 1) return EXPORT_DEFAULT_LIMIT;
  return Math.min(value, EXPORT_MAX_LIMIT);
}

function escapeCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return `${lines.join('\n')}\n`;
}

function nairobiDate(instant: Date): string {
  const shifted = new Date(instant.getTime() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export async function buildReportCsv(report: ReportKey, period: Period, limit: number): Promise<{ filename: string; csv: string; rows: number }> {
  const capped = clampExportLimit(limit);
  const from = nairobiDate(nairobiDayStart(period.start));
  const to = nairobiDate(nairobiDayStart(period.end));
  const filename = `veyra-${report}-${from}-to-${to}.csv`;
  switch (report) {
    case 'sales':
    case 'orders': {
      const orders = await prisma.order.findMany({
        where: { createdAt: { gte: period.start, lt: period.end } },
        select: { orderNumber: true, createdAt: true, status: true, paymentStatus: true, fulfillmentStatus: true, subtotal: true, discountTotal: true, shippingTotal: true, taxTotal: true, grandTotal: true, currency: true, customerEmail: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'asc' },
        take: capped,
      });
      return {
        filename,
        rows: orders.length,
        csv: toCsv(
          ['orderNumber', 'createdAt', 'status', 'paymentStatus', 'fulfillmentStatus', 'items', 'subtotal', 'discountTotal', 'shippingTotal', 'taxTotal', 'grandTotal', 'currency', 'customerEmail'],
          orders.map((o) => [o.orderNumber, o.createdAt.toISOString(), o.status, o.paymentStatus, o.fulfillmentStatus, o._count.items, Number(o.subtotal), Number(o.discountTotal), Number(o.shippingTotal), Number(o.taxTotal), Number(o.grandTotal), o.currency, o.customerEmail ?? '']),
        ),
      };
    }
    case 'products': {
      const items = await prisma.orderItem.findMany({
        where: { order: { status: { not: 'CANCELLED' }, createdAt: { gte: period.start, lt: period.end } } },
        select: { productName: true, sku: true, variantDescription: true, quantity: true, unitPrice: true, total: true, order: { select: { orderNumber: true, createdAt: true } } },
        orderBy: { createdAt: 'asc' },
        take: capped,
      });
      return {
        filename,
        rows: items.length,
        csv: toCsv(
          ['orderNumber', 'orderDate', 'productName', 'sku', 'variantDescription', 'quantity', 'unitPrice', 'lineTotal'],
          items.map((i) => [i.order.orderNumber, i.order.createdAt.toISOString(), i.productName, i.sku, i.variantDescription ?? '', i.quantity, Number(i.unitPrice), Number(i.total)]),
        ),
      };
    }
    case 'inventory': {
      const rows = await prisma.inventory.findMany({
        include: { variant: { select: { sku: true, status: true, product: { select: { name: true, status: true } } } } },
        orderBy: { updatedAt: 'desc' },
        take: capped,
      });
      return {
        filename,
        rows: rows.length,
        csv: toCsv(
          ['sku', 'productName', 'productStatus', 'variantStatus', 'onHand', 'reserved', 'available', 'lowStockThreshold'],
          rows.map((r) => [r.variant.sku, r.variant.product.name, r.variant.product.status, r.variant.status, r.quantityOnHand, r.quantityReserved, r.quantityOnHand - r.quantityReserved, r.lowStockThreshold]),
        ),
      };
    }
    case 'payments': {
      const payments = await prisma.payment.findMany({
        where: { createdAt: { gte: period.start, lt: period.end } },
        select: { order: { select: { orderNumber: true } }, provider: true, status: true, amount: true, currency: true, providerReference: true, paidAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: capped,
      });
      return {
        filename,
        rows: payments.length,
        csv: toCsv(
          ['orderNumber', 'provider', 'status', 'amount', 'currency', 'providerReference', 'paidAt', 'createdAt'],
          payments.map((p) => [p.order.orderNumber, p.provider, p.status, Number(p.amount), p.currency, p.providerReference ?? '', p.paidAt?.toISOString() ?? '', p.createdAt.toISOString()]),
        ),
      };
    }
    case 'customers': {
      const orders = await prisma.order.findMany({
        where: { status: { not: 'CANCELLED' }, userId: { not: null }, createdAt: { gte: period.start, lt: period.end } },
        select: { userId: true, grandTotal: true, user: { select: { email: true, firstName: true, lastName: true } } },
        take: capped,
      });
      const byUser = new Map<string, { email: string; name: string; orders: number; total: number }>();
      for (const order of orders) {
        const entry = byUser.get(order.userId as string) ?? { email: order.user?.email ?? '', name: `${order.user?.firstName ?? ''} ${order.user?.lastName ?? ''}`.trim(), orders: 0, total: 0 };
        entry.orders += 1;
        entry.total = Math.round((entry.total + Number(order.grandTotal)) * 100) / 100;
        byUser.set(order.userId as string, entry);
      }
      const rows = [...byUser.values()].sort((a, b) => b.total - a.total);
      return {
        filename,
        rows: rows.length,
        csv: toCsv(['email', 'name', 'orders', 'totalSpent'], rows.map((r) => [r.email, r.name, r.orders, r.total])),
      };
    }
    case 'refunds': {
      const refunds = await prisma.refund.findMany({
        where: { createdAt: { gte: period.start, lt: period.end } },
        select: { refundNumber: true, order: { select: { orderNumber: true } }, amount: true, currency: true, status: true, provider: true, providerReference: true, requestedAt: true, processedAt: true },
        orderBy: { createdAt: 'asc' },
        take: capped,
      });
      return {
        filename,
        rows: refunds.length,
        csv: toCsv(
          ['refundNumber', 'orderNumber', 'amount', 'currency', 'status', 'provider', 'providerReference', 'requestedAt', 'processedAt'],
          refunds.map((r) => [r.refundNumber, r.order.orderNumber, Number(r.amount), r.currency, r.status, r.provider, r.providerReference ?? '', r.requestedAt.toISOString(), r.processedAt?.toISOString() ?? '']),
        ),
      };
    }
  }
}
