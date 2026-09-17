import type { FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../lib/errors.js';
import { requireAuth } from './auth.js';

type OperationsUser = { roles?: Array<{ role?: { slug?: string | null } }> };

export async function requireOperationsAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = (request as FastifyRequest & { user?: OperationsUser }).user;
  const allowed = user?.roles?.some((entry) => {
    const slug = entry.role?.slug?.toLowerCase();
    return slug === 'staff' || slug === 'admin' || slug === 'super_admin' || slug === 'super-admin';
  });
  if (!allowed) throw new HttpError(403, 'FORBIDDEN', 'Fulfillment access is restricted to operations staff.');
}

export async function requireFinancialAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = (request as FastifyRequest & { user?: OperationsUser }).user;
  const allowed = user?.roles?.some((entry) => {
    const slug = entry.role?.slug?.toLowerCase();
    return slug === 'admin' || slug === 'super_admin' || slug === 'super-admin';
  });
  if (!allowed) throw new HttpError(403, 'FORBIDDEN', 'Financial operations require administrator access.');
}
