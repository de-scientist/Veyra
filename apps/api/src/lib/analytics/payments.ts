import { prisma } from '../prisma.js';
import { averageOrNull, type Period } from './periods.js';

export type PaymentMetrics = {
  attempts: number;
  successful: number;
  failed: number;
  pending: number;
  paidAmount: number;
  failedAmount: number;
  pendingAmount: number;
  /** PAID / (PAID + FAILED) concluded attempts. Null when no concluded attempts. */
  successRate: number | null;
  averageSuccessfulAmount: number | null;
  byProvider: Array<{ provider: string; attempts: number; successful: number; failed: number; paidAmount: number; successRate: number | null }>;
};

export async function paymentMetrics(period: Period): Promise<PaymentMetrics> {
  const groups = await prisma.paymentTransaction.groupBy({
    by: ['status', 'provider'],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _sum: { amount: true },
    _count: { id: true },
  });
  let attempts = 0;
  let successful = 0;
  let failed = 0;
  let pending = 0;
  let paidAmount = 0;
  let failedAmount = 0;
  let pendingAmount = 0;
  const byProvider = new Map<string, { attempts: number; successful: number; failed: number; paidAmount: number }>();
  for (const group of groups) {
    const count = group._count.id;
    const amount = Number(group._sum.amount ?? 0);
    attempts += count;
    const entry = byProvider.get(group.provider) ?? { attempts: 0, successful: 0, failed: 0, paidAmount: 0 };
    entry.attempts += count;
    if (group.status === 'PAID') {
      successful += count;
      paidAmount = Math.round((paidAmount + amount) * 100) / 100;
      entry.successful += count;
      entry.paidAmount = Math.round((entry.paidAmount + amount) * 100) / 100;
    } else if (group.status === 'FAILED') {
      failed += count;
      failedAmount = Math.round((failedAmount + amount) * 100) / 100;
      entry.failed += count;
    } else {
      pending += count;
      pendingAmount = Math.round((pendingAmount + amount) * 100) / 100;
    }
    byProvider.set(group.provider, entry);
  }
  const concluded = successful + failed;
  return {
    attempts,
    successful,
    failed,
    pending,
    paidAmount,
    failedAmount,
    pendingAmount,
    successRate: concluded === 0 ? null : Math.round((successful / concluded) * 1000) / 10,
    averageSuccessfulAmount: averageOrNull(paidAmount, successful),
    byProvider: [...byProvider.entries()].map(([provider, stats]) => {
      const providerConcluded = stats.successful + stats.failed;
      return { provider, ...stats, successRate: providerConcluded === 0 ? null : Math.round((stats.successful / providerConcluded) * 1000) / 10 };
    }),
  };
}

/** M-Pesa is the only configured provider: initiation vs verified outcome. Initiations are NOT successes. */
export async function mpesaMetrics(period: Period) {
  const [initiations, outcomes] = await Promise.all([
    prisma.paymentTransaction.count({ where: { provider: 'MPESA', createdAt: { gte: period.start, lt: period.end } } }),
    prisma.paymentTransaction.groupBy({
      by: ['status'],
      where: { provider: 'MPESA', createdAt: { gte: period.start, lt: period.end } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);
  const byStatus = new Map(outcomes.map((row) => [row.status, { count: row._count.id, amount: Number(row._sum.amount ?? 0) }]));
  const paid = byStatus.get('PAID') ?? { count: 0, amount: 0 };
  const failed = byStatus.get('FAILED') ?? { count: 0, amount: 0 };
  const concluded = paid.count + failed.count;
  return {
    initiations,
    successful: paid.count,
    failed: failed.count,
    paidAmount: paid.amount,
    averageSuccessfulAmount: averageOrNull(paid.amount, paid.count),
    successRate: concluded === 0 ? null : Math.round((paid.count / concluded) * 1000) / 10,
  };
}
