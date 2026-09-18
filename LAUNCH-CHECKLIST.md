# Veyra Launch Checklist

## Infrastructure

- [ ] Hosting (frontend + backend) decided and provisioned
- [ ] Production domain registered; DNS (A/CNAME/TXT) verified
- [ ] HTTPS enforced with auto-renewal; HTTP → HTTPS redirect verified
- [ ] Production PostgreSQL with app/migration roles, backups + tested restore
- [ ] Monitoring + alerts (5xx, callbacks, dead letters, pool saturation)

## Application

- [ ] Production build green (`typecheck`, `lint`, `test`, `build`)
- [ ] Environment variables set from `.env.example` (no localhost, no placeholders)
- [ ] Migrations applied in order; schema verified
- [ ] Seed limited to roles/permissions/bootstrap; no demo data
- [ ] Authentication + RBAC verified (customer/staff/admin fencing)
- [ ] Storefront, cart, checkout, orders verified against staging/sandbox

## Payments

- [ ] M-Pesa production credentials, shortcode, passkey, HTTPS callback URL
- [ ] `MPESA_ENVIRONMENT=production`; sandbox disabled
- [ ] Callback verified end-to-end in sandbox; idempotency + duplicate safety confirmed
- [ ] Payment failure paths tested (reject/timeout/mismatch); support process published

## Fulfillment

- [ ] Physical inventory reconciled per SKU; shipping zones/rates/methods approved
- [ ] Delivery + tracking display verified; return/refund flows dry-run

## Post-purchase

- [ ] Returns, exchanges, refunds operable by authorized roles
- [ ] Notifications verified for order/payment/delivery/return/refund/security events

## Operations

- [ ] Admin + analytics + audit logs accessible to authorized roles only
- [ ] Support runbook distributed; incident escalation contacts published
- [ ] Temporary credentials rotated; production access follows least privilege

## Security

- [ ] No secrets in Git/logs/errors/bundles; secret scan clean
- [ ] CORS exact origins; security headers verified; rate limits reviewed
- [ ] Security regression suite green; Next.js advisory upgrade scheduled

## Customer Experience

- [ ] Mobile + accessibility pass on core journeys; SEO (robots/sitemap/canonical) verified
- [ ] Error pages safe; policies published or explicitly deferred with legal review flagged:
      `UNKNOWN — REQUIRES BUSINESS/LEGAL REVIEW` (privacy, terms, shipping, returns, refunds)
