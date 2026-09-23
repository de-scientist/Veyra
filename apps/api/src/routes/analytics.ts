import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

import { HttpError } from '../lib/errors.js';
import { authLimit } from '../lib/rateLimits.js';
import { prisma } from '../lib/prisma.js';
import { requireOperationsAccess } from '../middleware/operations.js';
import { customerMetrics, customerSegments, topCustomers } from '../lib/analytics/customers.js';
import { METRIC_DEFINITIONS } from '../lib/analytics/definitions.js';
import { deliveryFailures, deliveryMethodSplit, fulfillmentDurations, fulfillmentStatus } from '../lib/analytics/fulfillment.js';
import { inventorySnapshot, lowStockList, movementAnalytics, velocityList } from '../lib/analytics/inventory.js';
import { dataQuality } from '../lib/analytics/quality.js';
import { mpesaMetrics, paymentMetrics } from '../lib/analytics/payments.js';
import { parseRange, presetRange, type PresetKey } from '../lib/analytics/periods.js';
import { mostReturnedProducts, topProducts, topVariants } from '../lib/analytics/products.js';
import { buildReportCsv, clampExportLimit, REPORT_KEYS, type ReportKey } from '../lib/analytics/reports.js';
import { exchangeMetrics, refundMetrics, returnMetrics, returnProcessingTime, returnReasons } from '../lib/analytics/returns.js';
import { revenueByCategory, revenueByPaymentMethod, salesSeries, salesSummary } from '../lib/analytics/sales.js';

const rangeSchema = z.object({
  preset: z.enum(['today', 'yesterday', 'last7', 'last30', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'thisYear']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  compare: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type AuthedRequest = FastifyRequest & { user?: { id: string } };

function actorId(request: FastifyRequest): string {
  const user = (request as AuthedRequest).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

function resolvePeriod(query: z.infer<typeof rangeSchema>) {
  if (query.preset && !query.from && !query.to) return presetRange(query.preset as PresetKey);
  return parseRange(query.from, query.to);
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/admin/analytics/overview', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [sales, payments, returns, refunds, inventory, quality] = await Promise.all([
      salesSummary(period, query.compare),
      paymentMetrics(period),
      returnMetrics(period),
      refundMetrics(period),
      inventorySnapshot(),
      dataQuality(),
    ]);
    const openIssues = quality.filter((issue) => issue.count > 0);
    return {
      success: true,
      data: {
        period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' },
        sales,
        payments: { attempts: payments.attempts, successful: payments.successful, failed: payments.failed, successRate: payments.successRate },
        returns: { requests: returns.requests, unitReturnRate: returns.unitReturnRate },
        refunds: { requests: refunds.requests, totalRefunded: refunds.totalRefunded },
        inventory,
        dataQuality: { openIssues: openIssues.length, issues: openIssues.map((issue) => ({ key: issue.key, title: issue.title, severity: issue.severity, count: issue.count })) },
      },
    };
  });

  app.get('/admin/analytics/sales', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [summary, series, byCategory, byPaymentMethod] = await Promise.all([
      salesSummary(period, query.compare),
      salesSeries(period),
      revenueByCategory(period),
      revenueByPaymentMethod(period),
    ]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, summary, series, byCategory, byPaymentMethod } };
  });

  app.get('/admin/analytics/products', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [top, variants, returned] = await Promise.all([
      topProducts(period, query.limit),
      topVariants(period, query.limit),
      mostReturnedProducts(period, 10),
    ]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, topProducts: top, topVariants: variants, mostReturned: returned } };
  });

  app.get('/admin/analytics/categories', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    // Parent totals cover only directly-categorised products; descendants are
    // listed separately to avoid double-counting hierarchical revenue.
    const byCategory = await revenueByCategory(period, 50);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, note: 'Parent category totals exclude descendant categories to avoid double-counting.', byCategory } };
  });

  app.get('/admin/analytics/customers', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [metrics, segments, top] = await Promise.all([
      customerMetrics(period),
      customerSegments(period),
      topCustomers(period, query.limit),
    ]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, metrics, segments, topCustomers: top } };
  });

  app.get('/admin/analytics/inventory', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [snapshot, lowStock, movements, velocity] = await Promise.all([
      inventorySnapshot(),
      lowStockList(50),
      movementAnalytics(period),
      velocityList(period, query.limit),
    ]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, snapshot, lowStock, movements, velocity } };
  });

  app.get('/admin/analytics/payments', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [metrics, mpesa] = await Promise.all([paymentMetrics(period), mpesaMetrics(period)]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, metrics, mpesa } };
  });

  app.get('/admin/analytics/fulfillment', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [status, durations] = await Promise.all([fulfillmentStatus(period), fulfillmentDurations(period)]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, status, durations } };
  });

  app.get('/admin/analytics/delivery', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [methods, failures] = await Promise.all([deliveryMethodSplit(period), deliveryFailures(period)]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, methods, failures } };
  });

  app.get('/admin/analytics/returns', { preHandler: requireOperationsAccess }, async (request) => {
    const query = rangeSchema.parse(request.query);
    const period = resolvePeriod(query);
    const [metrics, reasons, processing, exchanges, refunds] = await Promise.all([
      returnMetrics(period),
      returnReasons(period),
      returnProcessingTime(period),
      exchangeMetrics(period),
      refundMetrics(period),
    ]);
    return { success: true, data: { period: { from: period.start, to: period.end, timezone: 'Africa/Nairobi' }, metrics, reasons, processing, exchanges, refunds } };
  });

  app.get('/admin/analytics/quality', { preHandler: requireOperationsAccess }, async () => {
    return { success: true, data: { issues: await dataQuality() } };
  });

  app.get('/admin/analytics/definitions', { preHandler: requireOperationsAccess }, async () => {
    return { success: true, data: { timezone: 'Africa/Nairobi', metrics: METRIC_DEFINITIONS } };
  });

  app.get('/admin/analytics/export/:report', { preHandler: requireOperationsAccess, ...authLimit() }, async (request, reply) => {
    const { report } = request.params as { report: string };
    if (!(REPORT_KEYS as string[]).includes(report)) throw new HttpError(404, 'REPORT_NOT_FOUND', 'Unknown report.');
    const query = rangeSchema.extend({ format: z.enum(['csv']).default('csv'), exportLimit: z.coerce.number().int().min(1).max(5000).optional() }).parse(request.query);
    const period = resolvePeriod(query);
    const result = await buildReportCsv(report as ReportKey, period, clampExportLimit(query.exportLimit));
    await prisma.auditLog.create({
      data: {
        actorId: actorId(request),
        action: report === 'customers' ? 'CUSTOMER_REPORT_EXPORTED' : 'REPORT_EXPORTED',
        entity: 'Report',
        entityId: report,
        after: { rows: result.rows, from: period.start.toISOString(), to: period.end.toISOString() } as Prisma.InputJsonValue,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 300),
      },
    });
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${result.filename}"`).send(result.csv);
  });
}
