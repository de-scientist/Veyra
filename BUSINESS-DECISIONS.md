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
