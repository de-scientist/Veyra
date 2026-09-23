# JB Mercantile Production Environment

No production infrastructure is provisioned. Nothing below is claimed to exist;
every external item is marked `UNKNOWN — REQUIRES DEPLOYMENT/BUSINESS DECISION`
until configured. No secret values appear in this document.

## Application Topology (as built; hosting undecided)

```text
User → DNS → HTTPS → Hosting (undecided)
  → Next.js web (apps/web, :3000 dev) → Fastify API (apps/api, :3001 dev)
  → PostgreSQL 18 → M-Pesa Daraja → (future: email/SMS vendors, object storage)
```

- Monorepo (`apps/*`, `packages/*`, npm workspaces, `package-lock.json`).
- No CI configuration exists in-repo. No Docker/Procfile/manifests exist.
- Background work is in-process (`setImmediate` outbox drain); no separate worker host exists.

## Hosting / DNS / TLS

- Frontend host: UNKNOWN — REQUIRES DEPLOYMENT DECISION
- Backend host: UNKNOWN — REQUIRES DEPLOYMENT DECISION
- Database provider: UNKNOWN (dev: local PostgreSQL 18)
- Production domain, DNS records, certificate issuance/renewal: UNKNOWN
- Canonical base URL placeholder in code: `https://veyra.example.com` (must be replaced via `NEXT_PUBLIC_APP_URL`)

## External Services

| Service | State |
|---|---|
| M-Pesa Daraja | Sandbox-only placeholders; production creds, shortcode, passkey, HTTPS callback URL: UNKNOWN |
| Email | Log/mock providers only; vendor + SPF/DKIM/DMARC: UNKNOWN |
| SMS | Mock only; vendor + sender ID: NOT IMPLEMENTED — NO PRODUCTION SMS DEPLOYMENT REQUIRED |
| Media | URL references only; Cloudinary vars unset placeholders |
| Monitoring/alerting | None configured: UNKNOWN |

## Environment Parity

| Variable group | Dev default | Production requirement |
|---|---|---|
| `NODE_ENV` | development | `production` (drives Secure cookies, log transport) |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_API_URL` | localhost | Exact public origins; must match `CORS_ORIGIN` |
| `DATABASE_URL` | local Postgres | Managed instance, app vs migration roles, backups |
| `AUTH_SECRET`, `SESSION_SECRET` | insecure dev defaults | Fresh random ≥32 chars, rotated from any shared use |
| `MPESA_*` | sandbox placeholders | Production values via secret manager |
| `EMAIL_*/SMS_*` | log/mock, no secrets | Vendor values when providers are adopted |
| `CORS_ORIGIN` | localhost:3000 | Exact storefront origin(s) |
| `RATE_LIMIT_*`, `BODY_LIMIT_BYTES` | 100/min, 10/30 scoped, 1 MiB | Review against expected traffic |

## Data

- Dev database verified empty after test runs (self-cleaning suites).
- Production seed = roles/permissions/admin-bootstrap only (see DEPLOYMENT.md). No fake customers, orders, payments, or reviews — ever.
