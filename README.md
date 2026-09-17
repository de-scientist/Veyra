# Veyra Commerce

Veyra is a Kenya-first clothing e-commerce platform foundation built for future storefront, admin, and commerce workflow expansion.

## Stack

- Next.js
- Fastify
- PostgreSQL
- Prisma
- TypeScript
- Tailwind CSS
- Zod
- Vitest

## Repository structure

```text
apps/
  api/
  web/
packages/
  config/
  types/
  validation/
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/
.env.example
docker-compose.yml
```

## Local development

1. Copy `.env.example` to `.env` and adjust values.
2. Start Postgres via Docker Compose:
   ```bash
   docker-compose up -d postgres
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate Prisma client:
   ```bash
   npm run db:generate
   ```
5. Run database migrations:
   ```bash
   npm run db:migrate
   ```
6. Start the API:
   ```bash
   npm --workspace @veyra/api run dev
   ```
7. Start the web app:
   ```bash
   npm --workspace @veyra/web run dev
   ```

## Health check

```bash
curl http://localhost:3001/api/v1/health
```

## Notes

This project is intentionally in the foundation phase. Storefront, checkout, payments, and admin interfaces are deferred to later phases.
