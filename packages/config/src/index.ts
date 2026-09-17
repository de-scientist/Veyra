export const appConfig = {
  api: {
    port: Number(process.env.API_PORT ?? 3001),
    host: process.env.API_HOST ?? '0.0.0.0',
  },
  auth: {
    secret: process.env.AUTH_SECRET ?? 'development-secret-change-me',
    sessionSecret: process.env.SESSION_SECRET ?? 'development-session-secret-change-me',
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/veyra_dev?schema=public',
  },
  environment: process.env.NODE_ENV ?? 'development',
};
