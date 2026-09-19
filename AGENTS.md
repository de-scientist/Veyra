# AGENTS.md — Working Safely in JB Mercantile

Customer brand: **JB Mercantile** (Fashion • Footwear • Kitchen & Home). Internal identifiers still use `veyra` (`@veyra/*`, `veyra_session`, `veyra_dev`) — do not rename them, and never present them as the customer brand.

## Architecture

Monorepo: `apps/api` (Fastify, `/api/v1`), `apps/web` (Next.js 14), `packages/{config,types,validation}`, `prisma/` (schema + forward-only SQL migrations). PostgreSQL is the single source of truth. Single-store D2C — no vendors, no marketplace, no seller payouts. Currency is hardcoded KES.

## Hard Rules

- Do not invent business data, endpoints, tables, env vars, rates, or policies. Unverifiable = `UNKNOWN — REQUIRES VERIFICATION`.
- Do not bypass backend validation; do not trust frontend payment state — only verified M-Pesa callbacks establish `PAID`.
- Do not modify inventory from the UI except through audited admin endpoints; never describe cart quantity as reserved stock.
- Do not hard-code category assumptions — attributes/facets are data-driven (`lib/catalog.ts` registry pattern).
- Do not break API contracts (`{ success, error: { code, message, details, requestId } }`) or the Prisma forward-only migration discipline (apply with `psql`, never `migrate reset`).
- Do not expose secrets; only `NEXT_PUBLIC_API_URL` may be public. Never commit `.env`.
- Do not delete transactional history (orders, payments, movements, audit logs).
- Do not claim tests/builds passed unless you executed them (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`).
- Do not rewrite historical `PHASE-*-REPORT.md` files to match current architecture; mark historical context instead.
- UI: use `JBLogo` (official PNGs in `apps/web/public/`), `JBIcon` (no emoji icons), `useModalFocus` (single focus primitive), `JBConfirmDialog` (never `window.confirm`), theme tokens from `globals.css` (never hard-coded colors).

## Docs

README is the entry point; detail lives in `docs/`. Update docs when behavior changes. Status labels: IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / NOT VERIFIED / BLOCKED / FUTURE.
