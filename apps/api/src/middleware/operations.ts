import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  requireAdminAccess,
  requireFinancialAccess,
  requireOperationsAccess,
  requireSuperAdmin,
} from './auth.js';

/**
 * Backwards-compatible re-exports. Authorization logic lives in
 * `middleware/auth.ts` (single source of truth); these aliases preserve the
 * existing import surface used by route modules.
 */
export { requireAdminAccess, requireFinancialAccess, requireOperationsAccess, requireSuperAdmin };

export type { FastifyReply, FastifyRequest };
