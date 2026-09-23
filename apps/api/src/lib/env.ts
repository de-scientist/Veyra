import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().min(1).max(1000).default(30),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).max(10485760).default(1048576),
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
  RETURN_WINDOW_DAYS: z.coerce.number().int().positive().optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_PROVIDER: z.enum(['log', 'mock', 'smtp']).default('log'),
  EMAIL_FROM_ADDRESS: z.string().email().default('no-reply@veyra.local'),
  EMAIL_FROM_NAME: z.string().default('Veyra'),
  EMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
  SMS_PROVIDER: z.enum(['mock', 'log']).default('mock'),
  SMS_SENDER_ID: z.string().max(11).default('VEYRA'),
  SMS_WEBHOOK_SECRET: z.string().min(16).optional(),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  NOTIFICATION_BASE_DELAY_MS: z.coerce.number().int().min(1000).max(3600000).default(30000),
  NOTIFICATION_MAX_DELAY_MS: z.coerce.number().int().min(60000).max(86400000).default(3600000),
  NOTIFICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  // Cloudinary media (Phase C). All optional: absent credentials mean media
  // upload authorization is disabled and fails with a clear configuration
  // error instead of fake uploads. Never prefix these with NEXT_PUBLIC_*.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).max(120).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).max(120).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).max(256).optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).max(120).default('jb-mercantile'),
});

export const env = envSchema.parse(process.env);
