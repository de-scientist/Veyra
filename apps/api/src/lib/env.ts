import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32).default('development-auth-secret-change-me-123456'),
  SESSION_SECRET: z.string().min(32).default('development-session-secret-change-me-123456'),
});

export const env = envSchema.parse(process.env);
