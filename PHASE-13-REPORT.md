# PHASE 13 REPORT — ANALYTICS & REPORTING

## 1. Executive Summary

Phase 13 adds a read-only analytics and reporting layer over the authoritative Phase 0–12 commerce data. A timezone-correct (Africa/Nairobi, half-open ranges) aggregation library powers operations-guarded APIs for sales, products, categories, customers, inventory, payments (incl. M-Pesa), fulfillment, delivery, returns/exchanges/refunds, data quality, metric definitions, and capped audited CSV exports. The Phase 12 admin shell gains an analytics section with preset/custom filters, comparison periods, hand-rolled SVG charts (no new dependencies), accessible tables, and a definitions glossary. No transactional source of truth was duplicated; profitability is deliberately omitted (no cost data exists).

## 2. Repository Reconciliation

| Report claim | Actual repository | Phase 13 outcome |
|---|---|---|
| Phase 12: analytics Prep lists index needs | Verified: `Order(status/paymentStatus/fulfillmentStatus, createdAt)`, `Payment(status, createdAt)`, `AuditLog(action/actorId, createdAt)` exist; `Refund` lacked a status/createdAt index | Added `Refund(status, createdAt)`; no other indexes needed |
| Phase 12: "no costPrice field" | Confirmed: `ProductVariant` has no cost field; variant create-schema accepted and dropped it | Profitability/margin/COGS/turnover omitted with documented rationale, not fabricated |
| Phase 7: M-Pesa provider abstraction | Confirmed (`Payment`/`PaymentTransaction` with provider + verified states) | Success metrics use verified states only; initiation ≠ success |
| Phase 9: return/exchange/refund state machines | Confirmed distinct models and states | Kept distinct in every metric; no cross-inference |
| No analytics, export, or glossary surface | Confirmed absent | Implemented (see §24) |
| `@tanstack/react-query` in web deps | Present but unused by convention (prior phases use fetch + client components) | Followed existing fetch pattern; no new dependencies added |

## 3. Existing Analytics Capabilities

Before Phase 13, analytics consisted of the Phase 12 operations dashboard (live counts: orders today/week, paid/unpaid, fulfillment queues, low stock, customers) with no trends, comparisons, breakdowns, definitions, quality checks, or exports. That dashboard is unchanged; Phase 13 adds the analytical layer beside it.

## 4. Analytics Architecture

```text
Operational tables (Order/OrderItem/Payment/Delivery/Return/Refund/Inventory/User)
  ↓  Analytics lib (apps/api/src/lib/analytics/): periods → metric services
  ↓  Prisma aggregates + allow-listed DATE_TRUNC raw SQL (bound params only)
  ↓  Explicit DTOs (Decimals → numbers, null-safe averages/rates)
  ↓  routes/analytics.ts (operations-guarded, validated ranges, capped exports)
  ↓  /admin/analytics/* (filter bar → KPI cards → SVG charts → tables → exports)
```

No second transactional store, no materialized views (indexed aggregates suffice at current scale), no new vendors or queues.

## 5. Data Sources

Orders (+snapshotted OrderItems), Payments (+Transactions), Deliveries (+history/timestamps), ReturnRequests (+Items/history), Exchanges, Refunds, Inventory (+Movements/Reservations), Users (+roles), Reviews/Coupons only where listed. Snapshots (`productName/sku/unitPrice`) drive historical product reporting so archived products remain visible.

## 6. Metric Definitions

Every metric is specified (definition, formula, source, Nairobi date basis, exclusions, limitations) in `lib/analytics/definitions.ts` and served at `GET /admin/analytics/definitions` and the Definitions page. Core rules: half-open `[from, to)` ranges; cancelled orders excluded from sales; paid-only revenue recognition; `null` (rendered "—") for undefined divisions; comparison label "New — no prior-period baseline" instead of ∞%.

## 7. Sales Analytics

Gross sales (non-cancelled orders), paid revenue (paid + non-cancelled), net sales (paid − succeeded refunds, window-mixed and labeled as such), discounts, shipping collected, order/paid counts, AOV (null-safe), previous-period comparison, Nairobi-wall hourly/daily/weekly/monthly series (granularity by range length), revenue by category and by payment method. Sales page renders KPI cards, trend chart, and breakdown bars.

## 8. Product Analytics

Top products by revenue from snapshots (units, revenue, orders, average price, returned units, unit return rate), variant-level table preserving flexible attribute descriptions with live availability, most-returned list. Archived products remain reportable via snapshot fields + persistent joins.

## 9. Category Analytics

Revenue/units/orders by category with LEFT JOINs (uncategorised bucket explicit). Parent totals cover directly-categorised products only; descendants listed separately — documented on the endpoint and page to prevent double-counting hierarchical revenue.

## 10. Customer Analytics

Registered-customer totals, purchasing/new/returning counts (first-ever-order lookup), repeat rate, orders-per-customer, average value, **observed** lifetime value (labeled historical, never predicted), guest-order count alongside identity metrics. Rule-based segments (New, One-Time, Repeat, High-Value ≥ KES 20,000, Inactive 90 days) with thresholds flagged as technical defaults pending business policy. Top-customers table shows email/name only (no phone/address).

## 11. Inventory Analytics

Live snapshot (SKUs, on-hand, reserved, available, low/out-of-stock), low-stock list with thresholds, movement analytics by actual enum values plus largest changes, sales-velocity ranking (sold units vs available). No inventory valuation and no turnover metric — no cost data exists; turnover would require COGS, and revenue is not substituted.

## 12. Payment Analytics

Attempt/outcome counts and amounts by transaction status, success rate defined as PAID/(PAID+FAILED) with pending excluded and null-safe empties, average successful amount, per-provider breakdown. Raw payloads, secrets, and tokens never leave the backend.

## 13. M-Pesa Analytics

Initiations vs verified successes/failures, paid amount, average ticket, success rate — M-Pesa being the only configured provider. STK initiation is explicitly never counted as success.

## 14. Fulfillment Analytics

Delivery-status distribution over actual Phase 8 states and timestamp-backed stage durations (created→shipped, shipped→delivered, paid→delivered) with sample counts; stages lacking timestamps are excluded with null averages rather than zeros.

## 15. Delivery Analytics

Method distribution restricted to configured methods (plus explicit UNKNOWN bucket), completion rates per method, failed/attempted/delivered counts with failure-rate definition. No courier performance claims (no courier data).

## 16. Returns Analytics

Request counts by status, approved/rejected/resolved tallies, returned units and snapshot-based return value, dual documented rates (unit-based and delivered-order-based, labeled as windowed proxies), resolution time with samples, and reason breakdown using actual `ReturnItem.reason` values with shares.

## 17. Exchange Analytics

Request counts by `ExchangeStatus`, kept separate from returns and refunds throughout; replacement-fulfillment tracking remains the Phase 9 future extension.

## 18. Refund Analytics

Request counts/amounts by status from authoritative `Refund` records, total refunded (SUCCEEDED only), average refund; never inferred from return completion or order totals.

## 19. Profitability Analytics

Omitted by design: no `costPrice`, COGS, expense, tax-rule, or shipping-cost records exist. No profit/margin/ROI/turnover figures are shown anywhere; Phase 12's paid-order-value disclaimer is preserved. Required policies recorded as `UNKNOWN` (§33).

## 20. Operational Analytics

Needs-attention roll-up on the analytics overview (pending payments, unfulfilled paid orders, failed deliveries, pending returns/refunds, low stock) deep-linking into Phase 12 queues; bottleneck visibility via fulfillment durations and delivery failures. The Phase 12 operations dashboard remains the near-real-time surface; analytics pages are period-based.

## 21. Data Quality

`GET /admin/analytics/quality` and the Data Quality page probe seven conditions with exact counts and capped samples: paid-without-payment (high), negative inventory (high), reserved overflow (high), refund-over-paid (high), delivered-without-timestamp (medium), zero-total orders (medium), paid-without-reference (low). Issues link into operations pages; nothing is auto-corrected.

## 22. Reporting

Seven reports (sales, orders, products, inventory, payments, customers, refunds) share range parsing, row caps, Nairobi-date filenames, and audit logging. Reports page offers presets, custom ranges, and adjustable limits.

## 23. Export System

Hand-rolled CSV (proper quoting, no new libraries), default 1,000 rows / hard cap 5,000, `Content-Disposition` download, per-export audit (`REPORT_EXPORTED`, customer exports separately as `CUSTOMER_REPORT_EXPORTED` with row counts and range metadata). Customer exports contain email/name only — no phones, addresses, or secrets. No background jobs (documented; caps keep exports synchronous and safe), no scheduled reports (deferred).

## 24. API Architecture

`routes/analytics.ts` (registered in `app.ts`): 12 GET endpoints — `overview, sales, products, categories, customers, inventory, payments, fulfillment, delivery, returns, quality, definitions` — plus `export/:report`. All `requireOperationsAccess`; Zod-validated ranges (ISO datetimes, 400-day cap, no future starts), allow-listed granularities, bounded limits; error handler strips internals; CSV served with correct headers.

## 25. Database Queries and Indexes

Aggregates via Prisma `groupBy`/`aggregate`/`count`; time series and top-N via three parameterized `DATE_TRUNC`/`GROUP BY` raw queries (bucket unit allow-listed, dates bound). New index: `Refund(status, createdAt)` (migration `20260917_phase13_analytics`, additive-only). All other analytics patterns were already covered by Phase 9/12 indexes; verified rather than assumed.

## 26. Caching

No caching layer introduced: every figure is live authoritative data (freshness is implicit — no "last updated" labels needed, and none are faked). Rationale documented: current-scale indexed aggregates need no cache; stale payment/inventory presentation would be worse than the cost. Revisit triggers recorded for Phase 14.

## 27. RBAC

Every analytics/export endpoint enforces `requireOperationsAccess` server-side; no public analytics surface; profitability endpoints don't exist to protect; customer PII minimized in tables and exports; exports audited per actor. No per-metric permission splits (single operations boundary, consistent with Phase 12's coarse RBAC).

## 28. Security

Owner of risk review: no raw SQL from user input (allow-lists + bound params), no mass assignment (explicit schemas), no secret/PII leakage (DTO allow-lists; M-Pesa credentials untouched), export caps prevent resource abuse, global rate limiting applies, audit trail on all exports, IDOR/BOLA not applicable (no per-user scoping — operations-wide reads behind role guard), error messages generic.

## 29. Privacy

Aggregation preferred (counts/rates); customer tables/exports limited to email/name; no phones, addresses, auth secrets, or payment credentials in any analytics output; exports carry their own audit action for customer data.

## 30. Performance

Bounded ranges (400-day cap), capped limits (50 rows UI tables, 5,000 export), indexed filters, single-query aggregates, no full-table loads into Node except bounded inventory scans (2,000-row cap, documented). Dashboard-weight verification awaits production-scale data (see §33/§36).

## 31. Accessibility

Keyboard-operable filters/tables/exports, visible focus via existing design system, SVG charts carry `role="img"` + text labels with per-point `<title>` data, every chart paired with adjacent KPI/table equivalents (charts never the sole channel), color-independent badges, proper headings, accessible timestamps, `noindex` inherited from the admin layout.

## 32. Testing

`npm test`: **11 files / 60 tests pass** (50 pre-existing + 10 new in `lib/analytics/analytics.test.ts`: Nairobi day boundaries, half-open presets, range rejection incl. error codes, previous-period derivation, granularity rules, null-safe percent/average math, CSV escaping, export clamping, report-set coverage). DB-backed metric tests require a live database (unavailable, consistent with prior phases); query shapes were verified by typecheck + build. Manual QA per §89 checklist completed except live-data traversals.

## 33. Business Decisions

```text
UNKNOWN — REQUIRES BUSINESS DECISION: revenue recognition (paid-only vs confirmed) and cancelled-paid treatment.
UNKNOWN — REQUIRES BUSINESS DECISION: net-sales refund attribution (cohort vs window) and shipping/tax/discount handling.
UNKNOWN — REQUIRES BUSINESS DECISION: returning/high-value/inactive thresholds (defaults 2+ orders, KES 20,000, 90 days).
UNKNOWN — REQUIRES BUSINESS DECISION: fiscal calendar (calendar quarters shown, labeled).
UNKNOWN — REQUIRES BUSINESS DECISION: margin/COGS/tax/shipping-cost rules (profitability blocked until defined).
UNKNOWN — REQUIRES BUSINESS DECISION: customer export field policy and retention.
UNKNOWN — REQUIRES BUSINESS DECISION: production-scale performance budgets and caching triggers.
```

## 34. Known Limitations

- No live-database verification; migration unapplied in this environment.
- No profitability, turnover, valuation, tax, predictive LTV, or cohort analytics (data/policy absent — omitted, not estimated).
- No scheduled/background exports; 5,000-row synchronous cap.
- No materialized views; low-stock scan capped at 2,000 rows.
- Exchange replacement-fulfillment metrics await Phase 9 extension.
- Charts are SVG-only (no chart library per minimal-dependency rule).

## 35. Deferred Features

Scheduled reports, background export jobs, materialized views/caching layer, predictive LTV/forecasting, marketing-channel analytics, multi-currency conversion, fiscal-calendar support, accounting/ERP integration — all explicitly out of scope (§90); realtime push remains a Phase 11 topic.

## 36. Phase 14 Preparation

Candidates for Production Hardening + Security + Performance: apply pending migrations (Phases 11–13) against a real database and run DB-backed metric verification; load-test analytics at 1k/10k/100k orders and set budgets; review slow `DATE_TRUNC` scans for partial/covering indexes; tighten admin rate limits for export endpoints; rotate/verify webhook secrets; confirm backup/restore covers new tables; audit dependency vulnerabilities (`npm audit`); verify no dev provider (`log`/`mock`) can activate in production via env review; add cache layer only if measurements justify it.

```text
PHASE 13 COMPLETE

Analytics & Reporting has been implemented, tested, documented, secured, and integrated with the existing commerce architecture.

Implementation is intentionally stopped pending Phase 14.

NEXT PHASE: Phase 14 — Production Hardening + Security + Performance

Do not implement Phase 14.
```
