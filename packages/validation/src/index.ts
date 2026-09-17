import { z } from 'zod';

export const emailSchema = z.string().email();

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Slug must be URL-safe');

export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();
export const nonNegativeNumberSchema = z.number().nonnegative();

export const createUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(255),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  description: z.string().max(5000).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

export const createVariantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(100),
  price: z.number().nonnegative(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
});
