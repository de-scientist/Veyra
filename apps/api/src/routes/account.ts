import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
import * as account from '../lib/account/account.js';

const profileSchema = z.object({ firstName: z.string().min(1).max(120).optional(), lastName: z.string().min(1).max(120).optional(), phone: z.string().optional() });
const addressSchema = z.object({ label: z.string().max(60).optional(), line1: z.string().max(180), line2: z.string().max(180).optional(), city: z.string().max(180), state: z.string().max(60).optional(), postalCode: z.string().max(20).optional(), country: z.string().max(2).optional() });
const updateAddressSchema = z.object({ label: z.string().max(60).optional(), line1: z.string().max(180).optional(), line2: z.string().max(180).optional(), city: z.string().max(180).optional(), state: z.string().max(60).optional(), postalCode: z.string().max(20).optional(), country: z.string().max(2).optional() });
const orderQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(10), status: z.string().optional(), search: z.string().optional() });
const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128), confirmPassword: z.string().min(1) });
const claimSchema = z.object({ orderNumber: z.string().min(8).max(40), token: z.string().min(1) });
const defaultSchema = z.object({ type: z.enum(['shipping', 'billing']) });

function userId(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { user?: { id: string } }).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

export async function accountRoutes(app: FastifyInstance) {
  app.get('/account', { preHandler: requireAuth }, async (request) => {
    const uid = userId(request);
    return { success: true, data: await account.getAccountDashboard(uid) };
  });

  app.get('/account/profile', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getProfile(userId(request)) };
  });

  app.patch('/account/profile', { preHandler: requireAuth }, async (request) => {
    const payload = profileSchema.parse(request.body);
    return { success: true, data: await account.updateProfile(userId(request), payload) };
  });

  app.get('/account/addresses', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getAddresses(userId(request)) };
  });

  app.post('/account/addresses', { preHandler: requireAuth }, async (request) => {
    const payload = addressSchema.parse(request.body);
    return { success: true, data: await account.createAddress(userId(request), payload) };
  });

  app.patch('/account/addresses/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = updateAddressSchema.parse(request.body);
    return { success: true, data: await account.updateAddress(userId(request), id, payload) };
  });

  app.delete('/account/addresses/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    await account.deleteAddress(userId(request), id);
    return { success: true, data: { deleted: true } };
  });

  app.post('/account/addresses/:id/default', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = defaultSchema.parse(request.body);
    return { success: true, data: await account.setDefaultAddress(userId(request), id, payload.type) };
  });

  app.get('/account/orders', { preHandler: requireAuth }, async (request) => {
    const payload = orderQuerySchema.parse(request.query);
    return { success: true, data: await account.getOrders(userId(request), payload) };
  });

  app.get('/account/orders/:orderNumber', { preHandler: requireAuth }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    return { success: true, data: await account.getOrderDetail(userId(request), orderNumber) };
  });

  app.get('/account/orders/:orderNumber/tracking', { preHandler: requireAuth }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    return { success: true, data: await account.getOrderTracking(userId(request), orderNumber) };
  });

  app.post('/account/orders/:orderNumber/reorder', { preHandler: requireAuth }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    return { success: true, data: await account.reorder(userId(request), orderNumber) };
  });

  app.post('/account/orders/claim', { preHandler: requireAuth }, async (request) => {
    const payload = claimSchema.parse(request.body);
    return { success: true, data: await account.claimGuestOrder(userId(request), payload.orderNumber, payload.token) };
  });

  app.get('/account/payments', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getPayments(userId(request)) };
  });

  app.get('/account/returns', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getReturns(userId(request)) };
  });

  app.get('/account/refunds', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getRefunds(userId(request)) };
  });

  app.get('/account/security', { preHandler: requireAuth }, async (request) => {
    const uid = userId(request);
    return { success: true, data: { sessions: await account.getSessions(uid) } };
  });

  app.post('/account/security/password', { preHandler: requireAuth }, async (request) => {
    const payload = passwordSchema.parse(request.body);
    return { success: true, data: await account.changePassword(userId(request), payload) };
  });

  app.delete('/account/sessions/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    await account.revokeSession(userId(request), id);
    return { success: true, data: { revoked: true } };
  });

  app.delete('/account/sessions/others', { preHandler: requireAuth }, async (request) => {
    await account.revokeOtherSessions(userId(request));
    return { success: true, data: { revoked: 'others' } };
  });

  app.get('/account/preferences', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await account.getPreferences(userId(request)) };
  });

  app.patch('/account/preferences', { preHandler: requireAuth }, async (request) => {
    const payload = z.object({ emailOrderUpdates: z.boolean().optional(), emailDelivery: z.boolean().optional(), emailReturns: z.boolean().optional(), emailMarketing: z.boolean().optional() }).parse(request.body);
    return { success: true, data: await account.updatePreferences(userId(request), payload) };
  });

  app.post('/account/deactivate', { preHandler: requireAuth }, async (request) => {
    const uid = userId(request);
    await prisma.user.update({ where: { id: uid }, data: { status: 'INACTIVE' } });
    await prisma.session.updateMany({ where: { userId: uid, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: uid, action: AuditAction.ACCOUNT_DEACTIVATED, entity: 'User', entityId: uid } });
    return { success: true, data: { deactivated: true } };
  });

  app.post('/account/delete', { preHandler: requireAuth }, async (request) => {
    const uid = userId(request);
    await prisma.user.update({ where: { id: uid }, data: { status: 'DELETED', deletedAt: new Date() } });
    await prisma.session.updateMany({ where: { userId: uid, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: uid, action: AuditAction.ACCOUNT_DELETION_REQUESTED, entity: 'User', entityId: uid } });
    return { success: true, data: { deleted: true } };
  });
}

import { prisma } from '../lib/prisma.js';
import { AuditAction } from '@prisma/client';
