# DEV RUNTIME AUDIT

## Executive Summary

Both development servers run and communicate correctly. Three genuine runtime defects were found and fixed: a stale dev process serving a corrupt `.next` cache (port 3000), a missing `.env` load crashing the API on boot, and an unconfigured `next/image` host 500ing the homepage and shop. A fourth hazard (production `next build` corrupting a running dev server's cache) was identified procedurally. No console errors remain in headless-Chrome audits of five key pages.

## Repository Architecture

Architecture C (monorepo) + B (separate servers): `apps/web` (Next.js 14, `next dev -p 3000`), `apps/api` (Fastify 4 + tsx watch, port 3001), PostgreSQL 18, Prisma 5 client, npm workspaces with `package-lock.json`. Combined command: root `npm run dev` (concurrently). No rewrites/proxies — direct browser→API architecture via `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`).

## Server Configuration

Web: Framework Next.js 14.2.15, Command `npm run dev --workspace @veyra/web`, Host localhost, Port 3000, URL http://localhost:3000, Status RUNNING.
API: Framework Fastify 4, Entry `apps/api/src/server.ts`, Command `npm run dev --workspace @veyra/api`, Host 0.0.0.0, Port 3001, URL http://localhost:3001, Health `GET /api/v1/health`, Status RUNNING.

## Environment Audit

Required vars (`.env.example` vs code): `DATABASE_URL`, `AUTH_SECRET`, `SESSION_SECRET`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`, `MPESA_*`, rate-limit/body knobs — all present as names; no secret values exposed. Finding: tsx never loaded root `.env`, so the documented API dev command crashed (fixed via `--env-file=../../.env` in the workspace script). Next.js does not read root `.env` either, but its only public var has a correct local fallback (documented parity note).

## Dependency Audit

`node v24.21.0`, `npm 11.19.0`, manager npm (lockfile present). `npm audit`: findings unchanged from Phase 14 baseline (pinned-major advisories, no action taken). No missing deps; both servers boot.

## Static Checks

LINT: PASS (0 errors) · TYPECHECK: PASS (api + web) · TESTS: PASS (101/101) · BUILD: PASS (api tsc + Next build, all admin/analytics routes present).

## Runtime Checks

WEB startup: PASS · API startup: PASS (after env fix) · WEB health: 200 on /, /shop, /search, /cart, /checkout, /account, /admin, /admin/analytics/sales; 404 on unknown product · API health: 200 `{ok:true}` ~0.2 s · Ready: 200 (DB reachable) · DATABASE: PASS (Postgres 18, all domain tables, zero rows after suites).

## Browser Console

Headless Chrome (`--headless=new`, virtual-time budget) over `/`, `/shop`, `/cart`, `/account`, `/checkout`: zero console errors, zero uncaught exceptions, zero failed fetches, no hydration warnings, no error markers in rendered DOM. Cart page issued live `GET /api/v1/cart` calls answered 200 by the API log. Severity of all findings: none remaining.

## Network Audit

Register → 200 + HttpOnly session cookie; duplicate register → 409; login → 200 + roles; cookie → profile 200; wrong token → 404; guest order token gating intact. Preflight: exact-origin echo + credentials, correct methods/headers, `max-age 600`; evil origin gets no ACAO. No SSR API calls from public pages (static demo catalogue by design); client calls target `localhost:3001` directly.

## CORS Audit

Allowlist `CORS_ORIGIN` (default `http://localhost:3000`), credentials true, methods GET/POST/PATCH/DELETE/OPTIONS, headers including idempotency/confirmation/signature. Verified live, including negative case.

## Port Audit

3000 (web), 3001 (API), 5432 (Postgres) — no conflicts after removing the stale occupant. A stale node process (prior session's dev server) was holding 3000 with a corrupt cache; identified as project-owned and stopped (no unrelated processes touched).

## Database Audit

Reachable via untracked `.env`; migrations for Phases 11–13 applied earlier via psql; invariant scan (negative/reserved-overflow/dup SKU/dup order/orphan payments/paid-cancelled) all zero; suites self-clean to zero rows.

## Authentication Audit

Cookie sessions (HttpOnly, Lax, 7-day), bcrypt-12, generic login errors, server-side revocation, role fencing (customer→admin 403 in suite). Runtime register/login/profile verified over HTTP with correct cookie flags (`HttpOnly; SameSite=Lax`).

## Fixes Applied

1. Stale dev server + corrupt `.next` → stopped project-owned PID, cleared regenerable cache. Verified: port free, fresh boot clean.
2. API boot crash (`DATABASE_URL` undefined) → `--env-file=../../.env` in `apps/api/package.json` dev script. Verified: server listens, `/ready` 200.
3. Homepage/shop 500 (`images.unsplash.com` not configured) → `remotePatterns` in `apps/web/next.config.mjs`. Verified: 200 on both.
4. Procedural hazard: `next build` while `next dev` runs corrupts `.next` → documented; dev server restarted clean, all routes re-verified 200.

## Remaining Issues

- LOW: empty-cart `readyForCheckout` vacuity (checkout itself rejects empties; flagged for hardening).
- NOT AN ISSUE: level-50 API log lines during audit were harness-driven (malformed test JSON, duplicate registration) with correct safe responses.
- REQUIRES USER ACTION: none for local dev. Production items remain per PHASE-15-REPORT.
