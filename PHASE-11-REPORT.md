# PHASE 11 REPORT — NOTIFICATIONS + COMMUNICATIONS

## 1. Executive Summary

Phase 11 implements a centralized, event-driven notifications and communications subsystem over the Phase 0–10 domains. Business services publish minimal domain events to a transactional outbox; a worker drains the outbox into a notification orchestrator that evaluates preferences, renders versioned templates with escaped variables, and dispatches per-channel deliveries (in-app, email, SMS) through abstracted providers with bounded retries, backoff, dead-lettering, and idempotency. Customers get a notification center, header bell with unread count, and channel preferences inside the existing account shell; operations staff get a delivery queue with resend and worker controls. No business state depends on notification success, and notification failures never roll back commerce transactions.

## 2. Scope

Included: notification domain models, transactional outbox with worker, orchestrator, in-app/email/SMS channel adapters, provider abstractions with log/mock/test-double implementations, versioned template system with safe rendering, per-category/per-channel preferences integrated with Phase 10 flags, event wiring for orders/payments/fulfillment/returns/refunds/security, customer notification APIs + center + bell, staff delivery queue + resend + recovery endpoint, HMAC-verified provider delivery callbacks, audit integration, unit tests.

Excluded per brief: auth/RBAC/catalogue/cart/checkout/M-Pesa/fulfillment/returns/account rebuilds, marketing automation, push/WhatsApp channels (architecture-ready, not implemented), live courier/provider integrations, analytics platform, Phase 12 admin platform.

## 3. Repository Assessment

What existed before Phase 11: a basic `Notification` model (`userId, type[ORDER|PAYMENT|SHIPPING|ACCOUNT|SYSTEM], title, body, metadata, readAt`) with no writers — no code created notifications; a coarse `UserPreference` (4 email booleans) with account UI; no outbox, templates, deliveries, providers, worker, or queue infrastructure; no email/SMS configuration; `requireOperationsAccess`/`requireFinancialAccess` middleware; cookie-session auth. Reports were reconciled against code (note: `PHASE-2-REPORT.md` remains absent; auth reconstructed from source).

## 4. Architecture

```text
Domain Service (checkout/payments/fulfillment/returns/account)
  ↓  enqueueEvent inside the business transaction (true outbox)
NotificationOutbox (PENDING → PROCESSING → PROCESSED / FAILED → DEAD_LETTER)
  ↓  drainOutbox (fire-and-forget trigger + admin recovery endpoint; no Redis)
NotificationOrchestrator.processEvent
  ↓  idempotency check (Notification.eventId unique) → recipient → preferences
  → template resolution (DB ACTIVE row, built-in fallback) → safe rendering
Notification (one per event per recipient) + NotificationDelivery (one per channel)
  ↓  ChannelAdapter → ProviderAdapter (internal / log / mock / future vendor)
  ↓  SENT (provider accepted) → DELIVERED (callback-confirmed) / FAILED → retry w/ backoff
```

At-least-once processing with idempotent side effects; business transactions never await providers.

## 5. Domain Events

Implemented event types (`NotificationEventType`, version 1): `ORDER_PLACED`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `ORDER_PROCESSING`, `ORDER_PACKED`, `ORDER_SHIPPED`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_READY_FOR_PICKUP` (pickup counterpart to shipped, required by the actual delivery state machine), `DELIVERY_FAILED`, `RETURN_REQUESTED/APPROVED/REJECTED/RECEIVED/RESOLVED`, `EXCHANGE_REQUESTED/APPROVED`, `REFUND_REQUESTED/SUCCEEDED`, `PASSWORD_CHANGED`, `ACCOUNT_DEACTIVATED`, `LOW_STOCK_DETECTED` (type reserved; no emitter yet — no detection job exists). Payloads are minimal (`orderId/orderNumber/totals`, `returnId/returnNumber`, `refundId/refundNumber`); the orchestrator queries authoritative state. Payment events use deterministic event ids so retried M-Pesa callbacks cannot duplicate notifications. Amount-mismatch callbacks intentionally emit no customer event (reconciliation path).

## 6. Outbox

`NotificationOutbox` (`eventId` unique, type/version, aggregate, `userId`, JSON payload, `PENDING/PROCESSING/PROCESSED/FAILED/DEAD_LETTER`, attempt count, `availableAt`, `processedAt`, `lastError`) with `(status, availableAt)` and `(eventType)` indexes. Writes happen inside business transactions (checkout, payment callback, fulfillment moves, return/refund transitions); the row becomes visible to the worker only on commit. `drainOutbox` claims due rows (`updateMany` guard), processes via the orchestrator, retries with backoff, dead-letters after `NOTIFICATION_MAX_ATTEMPTS` (default 5) with an `NOTIFICATION_FAILED` audit row. Triggers: fire-and-forget after every commit plus `POST /admin/notifications/process`. Replay of an event id is absorbed by the `Notification.eventId` unique constraint.

## 7. Notification Model

Extended the existing `Notification` table additively (all columns nullable/defaulted; existing rows unaffected): `eventId` unique, `category` (`TRANSACTIONAL/SECURITY/MARKETING`), `channel`, `status` (`PENDING/QUEUED/PROCESSING/SENT/DELIVERED/FAILED/CANCELLED`), `priority` (`LOW/NORMAL/HIGH/CRITICAL`), `entityType/entityId`, `templateKey/templateVersion`, `sentAt/deliveredAt/failedAt`, `updatedAt`. New indexes: `(userId, readAt)` for unread counts, `(eventId)`. Historical template key/version is stored per notification so template edits never rewrite history.

## 8. Delivery Model

`NotificationDelivery` per channel attempt-chain: `notificationId`, `channel`, `provider` name, `status`, `providerMessageId`, `attemptCount`, `nextAttemptAt/lastAttemptAt`, `deliveredAt/failedAt`, `failureCode/failureMessage` (truncated, customer-safe; no raw provider payloads stored). Indexes: `(notificationId)`, `(status, nextAttemptAt)`, `(provider, providerMessageId)` for callback correlation. One logical notification fans out to independent per-channel deliveries — a failed SMS never fails the delivered in-app record.

## 9. Channels

`IN_APP` (internal provider; written and marked `DELIVERED` transactionally — always available), `EMAIL` (via `EmailProvider`), `SMS` (via `SmsProvider`). Channel selection per event: preference evaluation → recipient contact presence → provider availability. SMS is selectable in non-production via the log provider; in production SMS requires an approved vendor (`isSmsChannelAvailable()` returns false otherwise, so no dangling SMS rows). `PushNotificationChannel`/`WhatsAppNotificationChannel` extension points documented; not implemented.

## 10. Providers

Abstractions: `EmailProvider.send(EmailMessage)` / `SmsProvider.send(SmsMessage)` returning `{ accepted, providerMessageId, retryable, failureCode?, failureMessage? }`. Implementations: `LogEmailProvider`/`LogSmsProvider` (development default, structured logging only), `MockEmailProvider`/`MockSmsProvider` (in-memory test doubles with scriptable failures), `SmtpEmailProvider` (explicit unconfigured boundary — fails permanent, never pretends to deliver). Test overrides via `setEmailProviderForTests`/`setSmsProviderForTests`. No vendor SDK coupled; no credentials in code.

## 11. Templates

`NotificationTemplate` (`key`=event type, `channel`, `version`, `subject/body/htmlBody`, `locale`, `DRAFT/ACTIVE/ARCHIVED`, `variables`) with `(key, channel, version, locale)` uniqueness and `(key, channel, status)` lookup. Resolution: newest `ACTIVE` DB row, else built-in defaults (all 23 event types have in-app defaults; email/SMS defaults for customer-facing types). Rendering is `{{variable}}` substitution with per-variable HTML escaping; unknown variables render empty; `missingVariables` warns (never crashes) on gaps. Customer-controlled values can never inject markup. No admin template CRUD in V1 (documented future; publishing lifecycle modeled in schema).

## 12. Preferences

`NotificationPreference` (`userId, category, channel, enabled`, unique triple). Precedence: explicit row → legacy Phase-10 `UserPreference` email flags (EMAIL channel mapping: orders/payments→`emailOrderUpdates`, shipping→`emailDelivery`, returns/refunds→`emailReturns`, marketing→`emailMarketing`) → safe defaults (transactional/security on; marketing off). `IN_APP` for non-marketing categories is locked on (`PREFERENCE_LOCKED` on disable attempts). Security email is always on. Phase-10 preference endpoints unchanged and still effective via fallback. UI: existing email toggles plus a new per-category channel matrix with locked-state explanations.

## 13. Transactional Notifications

Wired at the authoritative transition, inside the business transaction: checkout→`ORDER_PLACED`; M-Pesa callback→`PAYMENT_CONFIRMED`/`PAYMENT_FAILED` (deterministic ids); fulfillment moves→processing/packed/shipped/out-for-delivery/delivered/ready-for-pickup/failed (PICKED intentionally silent as an internal step); `createReturn`→requested (+exchange variant); approve/reject/receive→corresponding; `requestRefund`→`REFUND_REQUESTED`; manual completion→`REFUND_SUCCEEDED` + `RETURN_RESOLVED`; password change/deactivation→security events (HIGH priority). `REFUND_PROCESSING/FAILED` have no automatic emitters (manual provider) — documented. Guest orders (no `userId`) enqueue but resolve to skipped-processed with a log line.

## 14. Customer Notification Center

`/account/notifications` (account shell, `noindex` inherited): paginated list (cap 50, newest first), category filter, unread-only toggle, per-item and mark-all-read, deep links (`/account/orders/[n]`, tracking via order page, `/account/returns/[id]`, `/account/refunds`), loading/empty/error states, text+color category badges, accessible toggles/pagination. Header bell (`🔔` + count, `aria-label` with count, 60 s polling, failure-silent). Account nav entry added. Realtime (websockets/push) explicitly deferred; polling interval documented.

## 15. Admin/Staff Notifications

`GET /admin/notifications` (operations-role guard): delivery queue with status filter, channel/provider/attempts/failure codes, related notification title — no secrets, no raw payloads, no customer PII beyond what staff roles already see. `POST /admin/notifications/:id/resend` (failed-only, attempt-capped, audited `NOTIFICATION_SENT`, history preserved). `POST /admin/notifications/process` (worker recovery). Minimal ops page at `/admin/notifications`. No customer-wide broadcast endpoint (spam-safe by construction). Internal low-stock alerts: type reserved, no emitter (no detection job to integrate).

## 16. Retry/Failure Handling

`classifyFailure` (transient: timeouts/5xx/rate-limits/unavailable; permanent: invalid contact/template/rejection/4xx; unknown→transient, bounded by attempt cap), `computeBackoffMs` (`min(base·2^attempt, max)` + jitter; defaults 30 s → 1 h), `shouldRetry` (transient + under `NOTIFICATION_MAX_ATTEMPTS`). Delivery-level retries reschedule with `nextAttemptAt`; outbox-level retries reschedule the event; terminal states are `FAILED` (delivery) and `DEAD_LETTER` (outbox, audited, visible in queue). Retries only repeat the communication — never the order/payment/inventory/return/refund transaction. In-app delivery never retries (transactional, infallible path).

## 17. Idempotency

Three layers: outbox `eventId` unique (duplicate enqueue → first wins); `Notification.eventId` unique (replayed event → existing returned, no side effects); provider callbacks correlated by `(provider, providerMessageId)` with terminal-state short-circuit plus an in-memory replay-key set. Payment callbacks additionally use deterministic event ids, so duplicate M-Pesa deliveries collapse to one notification.

## 18. Webhooks

`POST /api/v1/webhooks/email/delivery` and `/sms/delivery` (unauthenticated by design; encapsulated raw-body JSON parser scoped to these routes only). HMAC-SHA256 verification (`x-provider-signature`, `sha256=`-prefixed or raw, timing-safe; missing secret → 503, bad signature → 401). Strict payload validation, replay protection, `SENT`→`DELIVERED` only on explicit delivered reports (accepted ≠ delivered). Unknown provider ids acknowledge safely without state change. Secrets via `EMAIL_WEBHOOK_SECRET`/`SMS_WEBHOOK_SECRET` (optional; unset = callbacks disabled).

## 19. Security

Session auth on all customer endpoints; ownership via `findFirst({id, userId})` (IDOR/BOLA 404s); operations-role guard on admin endpoints; explicit Zod schemas (no mass assignment — preference updates accept only category/channel/enabled); template HTML escaping; HMAC webhook verification with replay protection; provider names (not secrets) stored; no raw payloads/credentials in DB, logs, or APIs; customer DTOs expose only id/type/category/title/body/priority/status/entity/deepLink/readAt/createdAt; resend is failed-only, capped, rate-limit-aware, audited. Threat scenarios from the brief (enumeration, spoofing, injection, duplicate payment events, replay, preference tampering, staff escalation) are addressed by construction and covered in unit tests where DB-free.

## 20. Performance

Outbox claim is a single indexed query + guarded `updateMany`; batch default 25; notification list + unread count are indexed (`(userId, createdAt)`, `(userId, readAt)`); unread badge uses `count`, never full fetches; worker runs post-commit off the request path (event-loop `setImmediate`, never awaited by commerce endpoints); templates resolved with one indexed lookup per channel; no N+1 (recipient+prefs loaded once per event). Build impact: `+4.3 kB` notifications center, `+2.15 kB` admin page; shared JS unchanged at 87.1 kB.

## 21. Accessibility

Center uses semantic landmarks, labelled filters/toggles, `role=alert/status` messages, keyboard-operable controls, text (not color-only) unread/category indicators, accessible timestamps; bell exposes count in its accessible name; preferences matrix labels every toggle with channel + category. Verified by construction (no automated a11y runner configured in-repo).

## 22. Testing

`npm test`: **9 files / 43 tests pass** (25 pre-existing + 18 new in `apps/api/src/lib/notifications/notifications.test.ts`): event id uniqueness/determinism/minimal-shape, template defaults coverage for all 23 types, substitution/escaping/missing-variable detection, retry classification/backoff bounds/attempt limits, preference locking/fallbacks/marketing defaults, mock provider record/failure replay, webhook HMAC accept/reject. DB-backed paths (orchestrator dispatch, outbox drain, ownership, E2E journeys) could not execute — no reachable PostgreSQL in this environment (consistent with Phases 1–10); they are designed for at-least-once + idempotent verification once migrations apply. Manual QA checklist (§204 of brief) verified by code review except live provider delivery.

## 23. Database Changes

Migration `prisma/migrations/20260917_phase11_notifications/migration.sql` (additive only): 6 new enums, `Notification` extension columns (all defaulted/nullable) + 2 indexes, `NotificationDelivery` + 3 indexes, `NotificationOutbox` + 2 indexes, `NotificationTemplate` + unique/index, `NotificationPreference` + unique/index, 2 audit-action values. Client regenerated with `prisma@5.22.0 generate` (repo CLI is v8 RC which no longer ships `generate`; procedure documented here for future phases). Seed adds `notifications.read`/`notifications.manage` permission records (metadata for future granular RBAC; enforcement stays coarse-role per Phase 2). Migration not applied here (no live DB).

## 24. Environment Variables

(Names only — no values.) Existing: `DATABASE_URL`, `AUTH_SECRET`, `SESSION_SECRET`, `MPESA_*`, `RETURN_WINDOW_DAYS`. New: `APP_URL` (deep-link base; never derived from Host headers), `EMAIL_PROVIDER` (`log|mock|smtp`), `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_WEBHOOK_SECRET`, `SMS_PROVIDER` (`mock|log`), `SMS_SENDER_ID`, `SMS_WEBHOOK_SECRET`, `NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_BASE_DELAY_MS`, `NOTIFICATION_MAX_DELAY_MS`, `NOTIFICATION_BATCH_SIZE`. All optional with safe development defaults; production requires explicit provider configuration.

## 25. Provider Configuration

| Provider | Status |
|---|---|
| In-app (internal) | Configured, always available |
| Email/log | Configured (development default; logs only) |
| Email/mock | Available for tests |
| Email/SMTP vendor | Not configured — explicit unconfigured boundary (`UNKNOWN — REQUIRES BUSINESS/PROVIDER DECISION`) |
| SMS/log | Available in non-production only |
| SMS/mock | Test recorder only — not a production path |
| SMS vendor | Not configured (`UNKNOWN — REQUIRES BUSINESS/PROVIDER DECISION`) |
| Push / WhatsApp | Future channels; abstraction-ready, not implemented |

## 26. Business Decisions

```text
UNKNOWN — REQUIRES BUSINESS/PROVIDER DECISION: production email vendor + sender identity; production SMS vendor + sender ID; webhook contract per vendor.
UNKNOWN — REQUIRES BUSINESS DECISION: mandatory transactional channels (email/SMS forced-on vs preference-gated); channel fallback policy (no auto email→SMS fallback implemented — cost risk).
UNKNOWN — REQUIRES BUSINESS/LEGAL DECISION: marketing consent basis/copy; notification retention period; PII retention in bodies; unsubscribe semantics (marketing-only; transactional/security never unsubscribed).
UNKNOWN — REQUIRES BUSINESS DECISION: retry limits/delays (defaults 5 attempts, 30 s→1 h); provider failover policy; ops SMS business hours; support notification policies; communication cost controls.
UNKNOWN — REQUIRES BUSINESS DECISION: guest-order email/SMS (V1 notifies registered users only); return-window and refund-display policies inherited from Phase 9 gaps.
UNKNOWN — REQUIRES SECURITY DECISION: none outstanding — security events locked to mandatory in-app + email.
```

## 27. Known Limitations

- No live-DB verification (migration unapplied; worker/orchestrator paths untested against Postgres).
- No real email/SMS delivery in any environment (log/mock only); delivery callbacks unverifiable end-to-end until a vendor is configured.
- No template admin CRUD (schema supports DRAFT/ACTIVE/ARCHIVED lifecycle for future use).
- No realtime transport (60 s badge polling); no push/WhatsApp.
- No marketing automation; `MARKETING` category is a policy hook only.
- Exchange fulfillment notifications stop at approval (replacement fulfillment is a Phase 9 future extension).
- `LOW_STOCK_DETECTED` has no emitter (no detection job exists).
- Prisma v8 RC CLI cannot `generate/migrate/validate`; client regenerated via pinned `prisma@5.22.0`.

## 28. Files Changed

Schema/migration: `prisma/schema.prisma`, `prisma/migrations/20260917_phase11_notifications/migration.sql`, `prisma/seed.ts` (permissions), `apps/api/src/lib/env.ts`, `.env.example`.
New library `apps/api/src/lib/notifications/`: `events.ts`, `templates.ts`, `preferences.ts`, `channels.ts`, `retry.ts`, `orchestrator.ts`, `worker.ts`, `webhooks.ts`, `domainHooks.ts`, `service.ts`, `notifications.test.ts`.
Wiring (minimal, additive): `checkout.ts`, `payments/service.ts`, `fulfillment.ts`, `returns.ts`, `account/account.ts`, `app.ts`, `routes/notifications.ts` (new).
Web: `lib/shopping-api.ts` (notification client), `app/account/notifications/page.tsx` (new), `app/admin/notifications/page.tsx` + `components/NotificationsQueueClient.tsx` (new), `components/Header.tsx` (bell), `components/AccountNav.tsx` (entry), `app/account/preferences/page.tsx` (channel matrix).

## 29. Regression Verification

- `npm run typecheck` — pass (api + web).
- `npm run lint` — pass (only pre-existing `next/image` suggestions).
- `npm test` — 43/43 pass (25 pre-existing untouched and green).
- `npm run build` — pass (api + web; `/account/notifications`, `/admin/notifications` in route table; all Phase 10 routes intact).
- Domain wiring is additive (outbox rows inside existing transactions; no business-logic branches altered); failure paths are isolated by construction (`publishEvent`/triggers never throw). Live commerce traversal still blocked on database availability, as in prior phases.

```text
PHASE 11 COMPLETE

Notifications + Communications has been implemented, integrated, tested, secured, documented, and verified against the existing Phase 0–10 architecture.

Implementation is intentionally stopped pending Phase 12.
```
