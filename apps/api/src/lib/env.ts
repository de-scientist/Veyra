import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32).default('development-auth-secret-change-me-123456'),
  SESSION_SECRET: z.string().min(32).default('development-session-secret-change-me-123456'),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_CALLBACK_URL: z.string().url().optional(),
  MPESA_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  M_PESA_CONSUMER_KEY: z.string().optional(),
  M_PESA_CONSUMER_SECRET: z.string().optional(),
  M_PESA_SHORTCODE: z.string().optional(),
  M_PESA_PASSKEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
