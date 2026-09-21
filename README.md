# JB Mercantile

**Fashion • Footwear • Kitchen & Home**

Kenya-first, single-store, direct-to-consumer multi-category e-commerce platform. Customers discover products across three departments, check out with validated delivery options, pay with M-Pesa, and manage post-purchase care from their account; operations staff run catalogue, inventory, orders, fulfillment, returns, and analytics from an RBAC-gated admin.

> Brand note: the customer-facing brand is **JB Mercantile**. Internal technical identifiers still use the historic `veyra` name (`@veyra/api`, `@veyra/web`, `veyra_session` cookie, `veyra_dev` database). These are engineering identifiers, not the customer brand.

## Core Capabilities

| Area | Status |
|---|---|
| Catalogue (products, variants, categories, collections, attributes, images) | IMPLEMENTED |
| Category-aware discovery (shop, search, filters, sort, pagination) | IMPLEMENTED |
| Guest + customer cart, wishlist | IMPLEMENTED |
| Validated checkout + order creation (KES, idempotent) | IMPLEMENTED |
| M-Pesa STK push + callback verification | IMPLEMENTED (live callbacks NOT VERIFIED) |
| Fulfillment (pickup, local delivery, courier-ready) + tracking | IMPLEMENTED |
| Returns, exchanges, refunds (manual disbursement) | IMPLEMENTED |
| Customer account (profile, addresses, orders, payments, security, preferences) | IMPLEMENTED |
| Admin + analytics + audit logs | IMPLEMENTED |
| Light / Dark / System theme, responsive UI, accessibility hardening | IMPLEMENTED |
| Production hosting, domain, monitoring, email/SMS vendors | NOT VERIFIED / BLOCKED — see [BUSINESS-DECISIONS.md](BUSINESS-DECISIONS.md) |

V1 is single-store direct-to-consumer. There is **no marketplace/vendor functionality**; marketplace concepts are a future consideration only.

## Technology Stack

- **Frontend** (`apps/web`): Next.js 14, React 18, TypeScript, Tailwind CSS, Zod, React Hook Form, TanStack Query, Zustand
- **Backend** (`apps/api`): Node.js, Fastify, TypeScript, Zod, Prisma, PostgreSQL, bcryptjs, Pino
- **Database**: PostgreSQL (Prisma ORM, forward-only SQL migrations)
- **Payments**: M-Pesa Daraja (STK push + callbacks)
- **Notifications**: pluggable email/SMS providers (log/mock/smtp stubs; production vendors NOT VERIFIED)
- **Tests**: Vitest — 13 files, 101 tests, all passing

## Repository Structure

```text
apps/
  api/        # Fastify backend (routes, lib domains, middleware)
  web/        # Next.js storefront + account + admin
packages/
  config/     # Shared app config from environment
  types/      # Shared type unions mirroring Prisma enums
  validation/ # Shared Zod schemas
prisma/
  schema.prisma
  migrations/ # Forward-only SQL (see DEPLOYMENT.md for apply order)
  seed.ts     # Roles, permissions, bootstrap admin, shipping baseline
docs/
  release/    # Release candidate, rollback plan, smoke tests
.env.example
docker-compose.yml   # Local PostgreSQL only
```

## Prerequisites

- Node.js 20+, npm 9+
- Docker (for local PostgreSQL) or a reachable PostgreSQL instance

## Getting Started

```bash
# 1. Configure environment
cp .env.example .env   # then edit values (never commit .env)

# 2. Start PostgreSQL
docker-compose up -d postgres

# 3. Install dependencies
npm install

# 4. Generate the Prisma client
npm run db:generate

# 5. Apply migrations
npm run db:migrate

# 6. Seed roles, permissions, bootstrap admin, shipping baseline
npm run db:seed

# 7. Start the API (http://localhost:3001) and web app (http://localhost:3000)
npm run dev
```

Seeded local admin: `admin@veyra.local` / `Admin123!` — local development only; rotate immediately and never use in production.

## Environment Configuration

See [.env.example](.env.example) and [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md). Key variables: `DATABASE_URL`, `AUTH_SECRET`, `SESSION_SECRET`, `APP_URL`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `MPESA_*`, rate-limit and notification settings. Media uploads need `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (server-only; absent = uploads disabled with a clear error) — see [docs/CLOUDINARY.md](docs/CLOUDINARY.md). Sender identities still carry historic defaults (`EMAIL_FROM_NAME="Veyra"`, `SMS_SENDER_ID="VEYRA"`) — REQUIRES BUSINESS DECISION.

## Testing

```bash
npm run typecheck   # API + web
npm run lint        # API + web
npm test            # Vitest suite (API domains + security + smoke journey + media + web lib)
npm run build       # API + web production builds
```

## Project Documentation

- [docs/](docs/) — documentation index
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system, domains, request flow
- [docs/DATABASE.md](docs/DATABASE.md) — schema, entities, ERD
- [docs/API.md](docs/API.md) — route inventory, conventions, auth, errors
- [docs/CATALOGUE.md](docs/CATALOGUE.md) — products, variants, attributes, discovery
- [docs/CHECKOUT.md](docs/CHECKOUT.md) — cart, wishlist, checkout, orders
- [docs/PAYMENTS.md](docs/PAYMENTS.md) — payments + M-Pesa
- [docs/FULFILLMENT.md](docs/FULFILLMENT.md) — delivery + fulfillment
- [docs/RETURNS-REFUNDS.md](docs/RETURNS-REFUNDS.md) — returns, exchanges, refunds
- [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) — sessions, RBAC, security controls
- [docs/ADMIN.md](docs/ADMIN.md) — operations platform + analytics
- [docs/UI-UX.md](docs/UI-UX.md) — brand, design system, discovery UX
- [docs/THEMING.md](docs/THEMING.md) — Light / Dark / System
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — WCAG target, focus, dialogs, testing
- [docs/INVENTORY.md](docs/INVENTORY.md) — stock model, movements, reservations
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — every variable, purpose, secrecy
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — common failures
- [SECURITY.md](SECURITY.md) — security policy
- [DEPLOYMENT.md](DEPLOYMENT.md) — deployment guide
- [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) — runbook
- [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md) — production topology (mostly NOT VERIFIED)
- [AGENTS.md](AGENTS.md) — conventions and safety rules for coding agents
- [DOCUMENTATION-UPDATE-REPORT.md](DOCUMENTATION-UPDATE-REPORT.md) — what this reconciliation changed

## Development Roadmap

Phases 0–15.5 delivered the platform (see `PHASE-*-REPORT.md`; note: no `PHASE-2-REPORT.md` exists in-repo). Open business/production gates live in [LAUNCH-GATE.md](LAUNCH-GATE.md), [BUSINESS-DECISIONS.md](BUSINESS-DECISIONS.md), and [LEGAL-READINESS.md](LEGAL-READINESS.md). Next: Phase 16 post-launch operations.

## Production Readiness

Launch-gated: hosting, domain/DNS/HTTPS, backups, monitoring, M-Pesa production ownership, legal policies, and business configuration are **BLOCKED — PRODUCTION INFRASTRUCTURE NOT YET VERIFIED**. See [LAUNCH-GATE.md](LAUNCH-GATE.md) and [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md).

## Troubleshooting

Port conflicts, missing env, database down, Prisma client drift, API unreachable, M-Pesa misconfiguration — see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
