# JB Mercantile — Business Decision Register

Companion to `JB-MERCANTILE-ADMIN-USER-MANUAL.md` (end-user manual) and
`JB-MERCANTILE-MANUAL-IMPLEMENTATION-RECONCILIATION.md` (reconciliation
evidence). For project maintainers and the business owner.

Status vocabulary (do not use any other labels):

- `DECIDED` — the business owner has confirmed the rule; implementation and
  manual both follow it.
- `IMPLEMENTATION-DEFINED` — the code enforces a safe rule and the manual
  teaches it, but no explicit business-owner sign-off is on record. Safe to
  operate; confirm at the next business review.
- `REQUIRES BUSINESS DECISION` — the software cannot safely select the rule;
  the manual promises nothing and the application does not pretend.
- `DEFERRED` — consciously postponed; recorded here so it is not forgotten.
- `NOT VERIFIED` — evidence is insufficient to state a rule.

Relationship to the root `BUSINESS-DECISIONS.md`: that file tracks
launch/production gates (hosting, M-Pesa production ownership, shipping
rates, legal). This file tracks catalogue/commerce business rules. Neither
replaces the other.

Evidence labels used below: **CODE-VERIFIED** (confirmed by source
inspection on 2026-10-07, corroborated by the passing test suite where
noted), **PARTIALLY VERIFIED**, **NOT VERIFIED** (no live-browser E2E was
available; see the reconciliation report).

---

## BD-001 — SKU ownership and immutability

| Field | Detail |
|---|---|
| Topic | Who owns variant SKUs; whether they can change |
| Current implementation | Server generates SKUs (`apps/api/src/lib/sku.ts` `generateSku`; planning in `lib/variant-generation.ts`; persistence in `lib/variant-generation-service.ts`). `variantUpdateSchema` and batch schema exclude `sku` with explicit immutability comments (`routes/catalogue.ts:71-79,615-617,675-676`). `ProductVariant.sku` is `@unique`; DB `P2002` maps to `409 SKU_ALREADY_EXISTS` (`lib/sku.ts:306-318`). Name/category/styleCode edits never rewrite SKUs (`routes/catalogue.ts:320-323`). CODE-VERIFIED. |
| Current documentation | Manual Chapters 13–14, 20: SKUs are server-generated, immutable, never retyped; wrong SKU ⇒ archive variant + create correct combination. |
| Problem | None remaining. Historical risk was casual SKU editing breaking order/inventory/barcode history. |
| Options | (a) Keep immutable (chosen). (b) Allow edits — rejected: damages `OrderItem` snapshots, movements, reporting. |
| Recommended option | (a). |
| Decision status | IMPLEMENTATION-DEFINED (behaves as decided; seek explicit owner sign-off at next review). |
| Business owner | TBD — REQUIRES VERIFICATION of sign-off. |
| Date | 2026-10-07 (reconciliation). |
| Implementation impact | None (already enforced + tested). |
| Documentation impact | Manual retains immutability rule. Done in v1.1. |

## BD-002 — Category dictionary code management

| Field | Detail |
|---|---|
| Topic | Who sets `Category.code`; whether admins may edit it |
| Current implementation | `Category.code` nullable `@unique`, 2–5 uppercase alphanumerics, validated both client and server (`admin/categories/page.tsx:53-57`; `routes/catalogue.ts:136-144,926-933`). Admin UI exposes **SKU code** + **SKU template** fields on create and edit with help text stating the code feeds SKU generation, cannot be removed from the form once set, and never rewrites existing SKUs. VariantManager points admins to `Catalogue → Categories → Edit (SKU code field)` (`VariantManager.tsx:59-60,272-280`). CODE-VERIFIED. |
| Current documentation | Manual v1.0 wrongly stated no code field exists and routed admins to support. Corrected in v1.1 (§§12.1, 13.3, 21, 23). |
| Problem | Prior audit (§10.1) reported a dead end; the UI has since gained the field and the manual lagged behind. |
| Options | (a) Admin-editable with guards (chosen by implementation). (b) Support-only — rejected: UI already ships guarded editing. |
| Recommended option | (a), plus owner confirms who in the business may set/change codes. |
| Decision status | IMPLEMENTATION-DEFINED (workflow works; ownership sign-off still wanted). |
| Business owner | TBD — REQUIRES VERIFICATION of sign-off. |
| Date | 2026-10-07. |
| Implementation impact | None. |
| Documentation impact | Manual corrected. Done in v1.1. |

## BD-003 — SKU template ownership

| Field | Detail |
|---|---|
| Topic | Who owns `Category.skuTemplate`; effect of changes |
| Current implementation | Optional per-category template (1–120 chars, ≥2 valid tokens, `-`-joined; `lib/sku.ts:188-231`). Admin-editable alongside code. Variants freeze `skuTemplateVersion` at creation; template edits never rewrite existing SKUs (comments `routes/catalogue.ts:962-971`; `variant-generation-service.ts:222`). CODE-VERIFIED. |
| Current documentation | Manual §§12.1, 14, 21 teach this. |
| Problem | None; needs owner awareness that template changes affect only future variants. |
| Recommended option | Keep current semantics. |
| Decision status | IMPLEMENTATION-DEFINED. |
| Business owner | TBD — REQUIRES VERIFICATION of sign-off. |
| Date | 2026-10-07. |
| Implementation impact | None. |
| Documentation impact | Done in v1.1. |

## BD-004 — Product vs variant pricing model

| Field | Detail |
|---|---|
| Topic | Where the selling price lives |
| Current implementation | Hybrid, CODE-VERIFIED: `Product.basePrice` (nullable, not settable from any admin UI or product schema — seed/support only) is a display fallback; `ProductVariant.priceOverride` is the authoritative selling price (`priceOverride ?? basePrice ?? 0` in `lib/storefront.ts:109`, `lib/shopping.ts:91`, `lib/checkout.ts:76`). Publish readiness requires every ACTIVE variant's effective price `> 0` (`routes/catalogue.ts:344`). No `Product.price` column exists. |
| Current documentation | Manual Chapter 15 teaches variant-price-only operation ("no product-level price field in the admin"). Accurate. |
| Problem | Owner has never explicitly confirmed variant-price-only vs base-price management. |
| Recommended option | Confirm variant-price-only as the operating model; decide whether `basePrice` should ever become admin-editable (if yes, that is a future feature, not this phase). |
| Decision status | REQUIRES BUSINESS DECISION (to elevate IMPLEMENTATION-DEFINED → DECIDED). |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. Do not add a base-price field without approval. |
| Documentation impact | Manual states current behaviour honestly. Done in v1.1. |

## BD-005 — Compare-at (was/now) pricing

| Field | Detail |
|---|---|
| Topic | Whether JB Mercantile wants visible discounts |
| Current implementation | Backend + API client support per-variant `compareAtPrice` (nullable; schemas, batch, generate paths; storefront `PriceDisplay` renders was/now strikethrough when `compareAtPrice > price`). VariantManager exposes **no compare-at field**. CODE-VERIFIED. |
| Current documentation | Manual §15.2 states backend support with no dashboard field and forbids improvising discounts. Accurate. |
| Problem | Advertising discounts requires a data-entry workflow that does not exist in the UI. |
| Recommended option | Owner decides: (a) do not use was/now (leave UI as-is), or (b) request a compare-at UI feature (future work). |
| Decision status | REQUIRES BUSINESS DECISION. |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. Do not add the UI field without approval. |
| Documentation impact | Manual states current behaviour honestly. Done in v1.1. |

## BD-006 — Coupon behaviour

| Field | Detail |
|---|---|
| Topic | What coupons do and how they redeem |
| Current implementation | Admin CRUD only, CODE-VERIFIED: list/search, create (`code` uppercased, type, value, status, dates, cap; `routes/admin.ts:354-396`), edit limited to **status / maxUses / validUntil** (code/value/type permanent). No customer coupon-apply or checkout-redemption path exists in `apps/api/src` (coupon references only in `admin.ts` + schema). Hence PARTIALLY IMPLEMENTED. |
| Current documentation | Manual Chapter 22 teaches creation + permanent fields and warns redemption is partial — confirm with support before advertising. Accurate. |
| Problem | Owner has not confirmed intended redemption behaviour. |
| Recommended option | Owner defines redemption rules (or defers coupons); engineering then implements redemption before any customer-facing promise. |
| Decision status | REQUIRES BUSINESS DECISION. |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. |
| Documentation impact | Manual marked PARTIALLY IMPLEMENTED. Done in v1.1. |

## BD-007 — Analytics definitions

| Field | Detail |
|---|---|
| Topic | What each dashboard metric means |
| Current implementation | CODE-VERIFIED: all `/admin/analytics/*` require operations access; timezone `Africa/Nairobi`; `GET /admin/analytics/definitions` serves `METRIC_DEFINITIONS` (`routes/analytics.ts:164-166`); sales from non-cancelled orders with `paidRevenue`/`netSales(paid−refunded)`/`AOV = paid revenue ÷ paid orders` (`lib/analytics/sales.ts`); product tables from immutable `OrderItem` snapshots; CSV exports audited. Interpretive thresholds (e.g. high-value orders, inactive customers) are technical defaults. |
| Current documentation | Manual Chapter 22 + §29 preserve the paid-order-value vs audited-revenue distinction and warn thresholds are technical defaults. Accurate. |
| Problem | Owner has not confirmed business definitions/thresholds. |
| Recommended option | Owner reviews the Definitions page + manual wording and confirms or adjusts thresholds. |
| Decision status | REQUIRES BUSINESS DECISION (thresholds/definitions sign-off). |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. |
| Documentation impact | Manual states current behaviour honestly. Done in v1.1. |

## BD-008 — Notification expectations

| Field | Detail |
|---|---|
| Topic | What delivery guarantees admins may assume |
| Current implementation | CODE-VERIFIED: event → orchestrator → outbox → worker → provider pipeline (`lib/notifications/`); statuses `PENDING/QUEUED/PROCESSING/SENT/DELIVERED/FAILED/CANCELLED`; retry/backoff classification (`retry.ts`); provider delivery webhooks (HMAC); admin **Run worker** drain + **Resend** on FAILED (`NotificationsQueueClient.tsx:81-149`); customer channel preferences (in-app/email/SMS). Production email/SMS vendors NOT VERIFIED (root BUSINESS-DECISIONS.md). |
| Current documentation | Manual Chapter 22 teaches queue semantics, worker drain, and resend of failed items without promising guaranteed delivery. Accurate. |
| Problem | Owner has not confirmed expected channels/SLAs; production vendors unprovisioned. |
| Recommended option | Owner confirms channels + vendors + expectations (links to root launch gates). |
| Decision status | REQUIRES BUSINESS DECISION. |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. |
| Documentation impact | Manual states current behaviour honestly. Done in v1.1. |

## BD-009 — Review visibility and moderation

| Field | Detail |
|---|---|
| Topic | How reviews are created, seen, and moderated |
| Current implementation | CODE-VERIFIED: `Review.status` default `APPROVED`; storefront reads APPROVED-only aggregates (`lib/storefront.ts:89,123,146-149`); admin list + `POST /admin/reviews/:id/moderate` (`APPROVED|REJECTED|PENDING`, audited `REVIEW_MODERATED`, `routes/admin.ts:331-352`); UI defaults to PENDING queue with Approve/Reject confirmations. **No customer review-submission endpoint or storefront submission UI was found** in `apps/api/src/routes` or `apps/web` — submission is NOT IMPLEMENTED; moderation of seeded/support-created reviews is IMPLEMENTED. |
| Current documentation | Manual Chapter 22 teaches the moderation queue only (no submission workflow documented). Accurate. |
| Problem | Owner has not confirmed whether customers should be able to submit reviews (verified-purchase rules, moderation policy). |
| Recommended option | Owner decides submission + moderation policy; submission is future work if wanted. |
| Decision status | REQUIRES BUSINESS DECISION. |
| Business owner | TBD. |
| Date | 2026-10-07. |
| Implementation impact | None until decided. |
| Documentation impact | Manual documents moderation only. Done in v1.1. |

## BD-010 — First super-admin provisioning

| Field | Detail |
|---|---|
| Topic | How the first super-admin comes into existence |
| Current implementation | CODE-VERIFIED: no super-admin is seeded and no default super-admin password exists. Seed creates `admin@veyra.local` with the **admin** role only (local-dev credential, rotate immediately; `prisma/seed.ts:127-153`). Registration always assigns **customer** (`routes/auth.ts:123-141`). Promotion is direct-database (`docs/AUTHENTICATION.md` SQL: insert `UserRole` for slug `super_admin`), then all further grants via audited `POST /admin/users/:id/roles` with self-lockout denied. |
| Current documentation | Manual §§5, 22 + FAQ state ordinary admins cannot promote themselves and first super-admin is database setup, never a default password. Accurate. |
| Problem | None for operations; owner must know the procedure lives with technical staff, not in the dashboard. |
| Recommended option | Keep procedure; treat as decided operations policy. |
| Decision status | IMPLEMENTATION-DEFINED (procedure documented in `docs/AUTHENTICATION.md` + manual; seek owner acknowledgement). |
| Business owner | TBD — REQUIRES VERIFICATION of acknowledgement. |
| Date | 2026-10-07. |
| Implementation impact | None. Never introduce default passwords or self-promotion. |
| Documentation impact | Manual states procedure honestly. Done in v1.1. |

## BD-011 — Attribute type management

| Field | Detail |
|---|---|
| Topic | Whether admins manage attribute `type` |
| Current implementation | CODE-VERIFIED: `Attribute.type` is a free string defaulting to `STRING` (`schema.prisma:541-550`; zod `catalogue.ts:153-156`, uppercased on write). Admin UI shows `{slug} · {type}` display-only ("Attribute type is system-managed and display-only"; `attributes/page.tsx:168-170`). Storefront control mapping (`AttributeControls.tsx` + `lib/catalog.ts:117-130`) keys off attribute **slug/name** (Colour→swatch, Size→option, etc.), not the `type` column. No functional admin↔storefront type link exists. |
| Current documentation | Manual §§13.1, 21 state type is display-only. Accurate. |
| Problem | Owner has never been asked whether type should be manageable; changing it would have no storefront effect today. |
| Recommended option | Keep system-managed unless a future feature gives `type` meaning; owner acknowledgement suffices. |
| Decision status | IMPLEMENTATION-DEFINED. |
| Business owner | TBD — REQUIRES VERIFICATION of acknowledgement. |
| Date | 2026-10-07. |
| Implementation impact | None. Do not expose type editing without a functional reason. |
| Documentation impact | Manual states current behaviour honestly. Done in v1.1. |

## BD-012 — Variant image requirements

| Field | Detail |
|---|---|
| Topic | Whether variants need their own images; what publishing requires |
| Current implementation | CODE-VERIFIED: variant creation explicitly does **not** require images (media error filtered with intent comments; `routes/catalogue.ts:501-531`) — first variant on an imageless draft is allowed. Publishing requires **≥1 product image including a primary** (`checkPublishReadiness`, `lib/catalog.ts:172-176`; enforced transactionally on every non-ACTIVE→ACTIVE transition, `routes/catalogue.ts:325-359`). Variant-specific images are optional bindings (`media/products.ts:166-171`); one shared product image satisfies publishing. 20-image cap; archived products read-only. |
| Current documentation | Manual v1.0 taught images-first as if mandatory. v1.1 clarifies: either order works; publishing is what requires images (≥1 + primary). |
| Problem | Old audit suspected a contradiction; code comments + tests resolve it — publish-time-only is the rule. |
| Recommended option | Keep publish-time rule; owner acknowledgement suffices. |
| Decision status | IMPLEMENTATION-DEFINED. |
| Business owner | TBD — REQUIRES VERIFICATION of acknowledgement. |
| Date | 2026-10-07. |
| Implementation impact | None. |
| Documentation impact | Manual clarified. Done in v1.1. |

---

## Summary table

| Decision | Status | Current rule | Required action |
|---|---|---|---|
| BD-001 SKU ownership | IMPLEMENTATION-DEFINED | Server-generated, immutable, DB-unique | Owner sign-off at next review |
| BD-002 Category code | IMPLEMENTATION-DEFINED | Admin-editable (2–5 alnum), guarded, never rewrites SKUs | Owner sign-off on who may set codes |
| BD-003 SKU template | IMPLEMENTATION-DEFINED | Admin-editable, versioned, future-variants-only | Owner sign-off |
| BD-004 Pricing model | REQUIRES BUSINESS DECISION | Variant-price-only in practice (`priceOverride`; `basePrice` fallback, not admin-editable) | Owner confirms model |
| BD-005 Compare-at pricing | REQUIRES BUSINESS DECISION | Backend-supported, no dashboard field | Owner decides if was/now wanted |
| BD-006 Coupons | REQUIRES BUSINESS DECISION | Admin CRUD only; no redemption engine (PARTIALLY IMPLEMENTED) | Owner defines redemption behaviour |
| BD-007 Analytics | REQUIRES BUSINESS DECISION | Nairobi TZ, paid-value definitions served by API; thresholds are technical defaults | Owner confirms definitions/thresholds |
| BD-008 Notifications | REQUIRES BUSINESS DECISION | Queued/sent/delivered/failed pipeline; resend-on-failed; vendors NOT VERIFIED | Owner confirms channels/vendors/SLAs |
| BD-009 Reviews | REQUIRES BUSINESS DECISION | Moderation queue implemented; customer submission NOT IMPLEMENTED | Owner decides submission + moderation policy |
| BD-010 Super-admin provisioning | IMPLEMENTATION-DEFINED | DB promotion, no default password, no self-promotion | Owner acknowledgement |
| BD-011 Attribute types | IMPLEMENTATION-DEFINED | System-managed, display-only, no storefront effect | Owner acknowledgement |
| BD-012 Variant images | IMPLEMENTATION-DEFINED | Optional per-variant; ≥1 + primary required to publish | Owner acknowledgement |
