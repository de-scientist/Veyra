# Veyra Production Checklist

## Security

- [ ] HTTPS enforced end-to-end; HSTS at edge; Secure cookies (production `NODE_ENV`)
- [ ] `CORS_ORIGIN` set to exact storefront origin(s); no wildcard
- [ ] Security headers verified (helmet + Next subset); CSP nonce architecture planned
- [ ] Rate limits reviewed (`RATE_LIMIT_*`); auth endpoints strict
- [ ] `npm audit` reviewed; Next.js 14 advisories dispositioned (upgrade path planned)
- [ ] No secrets in Git, logs, errors, or client bundles; webhook secrets rotated from placeholders
- [ ] Security regression suite green (`apps/api/src/security.test.ts`, incl. DB-backed IDOR)

## Database

- [ ] Production database provisioned; app vs migration roles separated
- [ ] All migrations applied in order (`20260917_*`); no reset
- [ ] Phase 12/13 indexes present; backups scheduled + restore tested

## Payments

- [ ] M-Pesa production credentials; `MPESA_ENVIRONMENT=production`
- [ ] Public HTTPS callback URL configured; sandbox callbacks disabled
- [ ] Idempotency + duplicate-callback behavior verified in sandbox

## Performance

- [ ] Bundle size, LCP/INP/CLS baselined on production-like data
- [ ] Slow-query review on analytics ranges; export caps confirmed

## Operations

- [ ] Monitoring + alerts (5xx rate, callback failures, dead letters, pool saturation)
- [ ] Logs shipping with request IDs; retention defined
- [ ] Runbook + incident response contacts published; rollback rehearsed
- [ ] Production domain, DNS, metadataBase, and support contact finalized
