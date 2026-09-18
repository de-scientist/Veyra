# Smoke Test Evidence (2026-09-18, local)

## Automated Suites

- `npm test`: **101/101 pass** — 60 domain/unit, 31 security (12 unauth 401-contract,
  validation precedence, error/CORS/headers/probes, login 429 flood, 7 DB-backed
  IDOR/RBAC with verified fixture cleanup), 10 smoke (catalog → cart → validation →
  preview → checkout → token-gated confirmation → reservation proof → fail-closed
  payment → registration → eligibility rejection → staff ops → fencing → cleanup).
- `npm run typecheck`: PASS (api + web). `npm run lint`: PASS (0 errors).
- `npm run build`: PASS (API tsc + Next production build, all routes present).

## Live Servers

- API `http://localhost:3001`: `/health` 200 (~0.2 s), `/ready` 200, catalog 200,
  CORS exact-origin echo + credentials, evil origin denied, preflight 204 correct,
  helmet + rate-limit headers present.
- Web `http://localhost:3000`: `/`, `/shop`, `/search`, `/cart`, `/checkout`,
  `/account`, `/admin`, `/admin/analytics/sales` → 200; unknown product → 404;
  `/api/*` on web → 404 (no accidental proxy).
- Headless Chrome × 5 pages: zero console errors, zero failed fetches, zero
  hydration warnings, no error markers in rendered DOM; cart page issued live API
  calls answered 200.

## Journeys

- Register → login → cookie → protected profile: 200 end-to-end over HTTP.
- Guest checkout → token-gated order read; wrong token → 404.
- Customer → admin endpoints → 403; cross-account reads → 404 (DB-backed).
- M-Pesa without credentials fails closed (no PAID ever asserted).
- Dev DB verified at zero rows after all suites (no residue).

## Not Executed Here

Sandbox payment authorization, mobile devices, assistive tech, production
volumes — require staging/external resources (see PHASE-15.5-REPORT §30).
