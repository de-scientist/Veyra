# Business Decision Register

`UNKNOWN — REQUIRES BUSINESS DECISION` unless noted. None of these block local
validation; items marked BLOCKER gate public launch.

- Production domain + brand canonical URL — BLOCKER for launch.
- Hosting/database/monitoring vendors and budgets — BLOCKER for launch.
- M-Pesa production ownership (shortcode, settlement account, support contact) — BLOCKER for live payments.
- Email/SMS vendors, sender identities, volume/cost policy.
- Shipping rates, zones, delivery coverage, pickup points — BLOCKER for checkout.
- Return window, refund/exchange rules, restocking-fee policy — BLOCKER for post-purchase trading.
- Tax handling (prices inclusive/exclusive, reporting).
- Marketing consent basis and sender-frequency policy.
- Support hours, channels, SLAs, and escalation contacts — BLOCKER for trading.
- RPO/RTO objectives for backups.
- Log/audit retention periods — `UNKNOWN — REQUIRES BUSINESS/LEGAL REVIEW`.
- Analytics thresholds carried as technical defaults (high-value KES 20,000; inactive 90 days).
- Next.js major-upgrade window for advisory remediation.
- Release tagging/versioning convention (currently unversioned).
- Password reset / email verification flows — FORMALLY DEFERRED (Phase 15 decision):
  `PasswordResetToken` / `EmailVerificationToken` models exist but no endpoints
  consume them and no production email vendor is configured, so there is no
  reset-token attack surface deployed. Authenticated password change works.
  Rationale: implementing email-delivered single-use tokens without a verified
  sender identity, SPF/DKIM/DMARC, and rate-limited delivery would create
  account-takeover risk rather than reduce it. UX impact: users who forget
  passwords must contact support for an assisted reset until the flow ships.
  Alternative recovery: support-assisted reset via an audited admin/bootstrap
  process (least-privilege operator, temporary credential rotated immediately).
  Owner: business/product. Target: dedicated auth follow-up once email vendor
  and sender-domain authentication are provisioned. Launch approval accepts
  this limitation; status is FORMALLY DEFERRED, not NOT VERIFIED.
