# Phase A — Runtime Error & Data Contract Stabilization Report

Status: IMPLEMENTED. Stack: Next.js 14.2.15, React 18.3.1, Fastify 4, Prisma 5 (`apps/api`), PostgreSQL 18. Currency KES. Auth: cookie sessions (unchanged).

## 1. Executive Summary

All seven reported defect classes were traced to source and fixed at the correct architectural layer — no suppressions, no `any` shortcuts, no mock data, no hard-coded business data, no auth/architecture changes:

1. **Product editor `null.value` crash** — React synthetic events dereferenced inside deferred functional state updaters. Fixed by capturing primitive values synchronously (mirroring the existing safe pattern in `admin/products/new`).
2. **Related event/state crashes** — the same latent pattern in 12 additional files fixed with the same capture-before-update pattern.
3. **Storefront propagation** — same shared-component root cause (see 5); no independent storefront bug.
4. **`sessions.filter is not a function`** — frontend typed `GET /account/security` as a bare array; backend returns `{ sessions: [...] }`. Normalized in the API-client layer.
5. **Hydration failure (`<div>` inside `<p>`)** — `PriceDisplay` rendered a `<div>` root while embedded in `<p>`/`<span>`/`<small>` (notably `products/[slug]`). Root changed to `<span>`.
6. **Checkout delivery-zone 400** — frontend sent `shippingZoneCode: ''`; backend optionally accepted `''` then failed downstream. Blank optionals are now omitted client-side; empty strings rejected explicitly server-side; empty/loading/error UI states added.
7. **Admin analytics overview 400** — frontend sent date-only `from`/`to`; backend requires ISO datetimes with offset. Client normalizes calendar days to Nairobi midnight (`+03:00`); backend schema stays strict.
8. **Cloudinary `ERR_INTERNET_DISCONNECTED`** — environmental network failure, not an application defect (upload construction + graceful `NETWORK_ERROR` handling verified).

## 2. Defect Matrix

| Issue | Root Cause | Fix | Verification |
| ----- | ---------- | --- | ------------ |
| Product editor `null.value` (`admin/products/[id]`, incl. lines ~170/253) | `e.currentTarget.value` read inside deferred `setState(prev => …)` updater, after React clears `currentTarget` | `set`/`setVariant` helpers capture the primitive synchronously (same architecture as `admin/products/new`) — 9 sites | typecheck, lint, build; no remaining updater-closure event reads repo-wide (grep) |
| Related event/state crashes (coupons, customers, inventory, products, users, audit-logs, orders, notifications, returns, fulfillment, checkout checkbox) | Same deferred-updater event pattern | Capture-before-update in each handler | grep confirms zero remaining instances; typecheck/lint pass |
| Storefront `null.value` replay | Shared component/util reuse, not an independent bug | Fixed at source (editor updaters + `PriceDisplay`) | `products/[slug]` traced; no separate storefront defect found |
| `sessions.filter is not a function` (`account/security`) | Contract drift: client expected `AccountSession[]`, API returns `{ sessions: AccountSession[] }` (`apps/api/src/routes/account.ts:180`) | `getSessions()` in `shopping-api.ts` normalizes envelope → typed array, unknown shapes → `[]` | `sessions.test.ts` (4 tests): envelope, bare array, malformed shapes, current/active/revoked representation |
| Hydration `<div>` in `<p>` (`PriceDisplay`) | `<div>` root embedded in `<p className="muted-copy">` on `products/[slug]` (+ `<span>`/`<small>` sites) | Root `<div>` → `<span>` (phrasing content, valid everywhere); no `suppressHydrationWarning` | `price-display.test.ts` (3 tests): span root, no `<div>`, valid inside `<p>`; full `next build` passes |
| Checkout delivery-zone 400 | `input()` sent `shippingZoneCode: ''`; schema `z.string().trim().max(50).optional()` let `''` through to `resolveShipping` → 400 | New pure `buildCheckoutInput()` omits blank optionals; schema tightened to `.min(1)`; review() guards missing selection with a controlled message; empty-zones/methods UI states | `checkout-input.test.ts` (4) + `contracts.test.ts` (3 checkout) pass |
| Analytics overview 400 (`?from=2026-09-25&to=2026-09-27&compare=true`) | Date-only values fail `z.string().datetime({ offset: true })` (`routes/analytics.ts`) | `toAnalyticsDateTime()` normalizes `YYYY-MM-DD` → `T00:00:00+03:00` (Nairobi, no DST) in `queryString` + CSV export path; backend untouched/strict | `analytics-api.test.ts` (5) + `contracts.test.ts` (3 analytics) + Nairobi round-trip assertion in `analytics.test.ts` pass |
| Cloudinary upload errors | Browser-offline (`ERR_INTERNET_DISCONNECTED`), correctly constructed signed request | No code change; existing `NETWORK_ERROR` → user-facing retry message verified (`media-upload.ts`), covered by `media-upload.test.ts` | Existing tests pass |

## 3. Product Editor

- **Null event issue:** all 9 `setForm`/`setVariantForm` updaters in `apps/web/app/admin/products/[id]/page.tsx` now go through `set(key, value)` / `setVariant(key, value)` helpers that receive the already-extracted primitive — identical architecture to `apps/web/app/admin/products/new/page.tsx`, which was already safe.
- **State initialization:** controlled fields initialize to `''` (string selects) and stay strings; numeric `price` uses the existing string-form convention, converted with `Number()` only at submit with `Number.isFinite` + non-negative guards. No `undefined`/`null` transitions introduced.
- **Attribute/variant contract:** verified end-to-end — `GET /admin/attributes` returns a bare array and `getAdminAttributes()` types it as `AdminAttribute[]` (aligned, no envelope bug). Empty-attribute state now renders a recoverable notice instead of a dead required select. Stale-attribute risk is structurally contained: variant creation posts `{ attributeId, value }` free-text values, and attribute deletion is backend-blocked with 409 while in use (`ATTRIBUTE_IN_USE`), so saved variants cannot be orphaned by deletion.
- **Related fixes:** 12 further files with the identical deferred-updater pattern fixed (see matrix). Direct-argument reads (`setX(e.currentTarget.value)`, `update('k', event.target.value)`) were audited and left untouched — they evaluate synchronously during dispatch and are safe.

## 4. Account Security

- **Response contract:** `GET /api/v1/account/security` → `{ success: true, data: { sessions: AccountSession[] } }` (`account.ts:180`, via `account.getSessions(userId, currentSessionId)`).
- **Normalization:** owned by `getSessions()` in `apps/web/lib/shopping-api.ts` (API-client/service layer). The page receives `Promise<AccountSession[]>`; JSX contains no shape workarounds. Bare-array responses still accepted; unrecognized shapes resolve to `[]`.
- **Revoke behavior (preserved):** `DELETE /account/sessions/:id` and `DELETE /account/sessions/others` (static route before param route); backend `revokeOtherSessions` excludes the current session; UI reloads sessions after each revocation; empty/loading/error states already present and unchanged.

## 5. Hydration

- **Invalid HTML:** `PriceDisplay` root `<div>` nested inside `<p>` (`apps/web/app/products/[slug]/page.tsx:127–130`), plus `<span>`/`<small>` parents on order/return pages.
- **Structural fix:** root is now `<span>`; all descendants are phrasing content. No `suppressHydrationWarning` added. The pre-existing `suppressHydrationWarning` on `<html>` in `app/layout.tsx` is intentional and documented (theme pre-hydration script) — left untouched.
- ** wider scan:** all `window`/`document`/`localStorage` usages live in effects/event handlers, never in render; no random/timestamp/viewport-dependent render output found. `CheckoutPageClient`'s `Date.now()/Math.random()` idempotency key is state-only, never rendered — no mismatch.

## 6. Delivery Zones

- **Request:** `POST /api/v1/checkout/preview` (also `/checkout`) with `{ …, shippingZoneCode, deliveryMethodId, address, … }`; auth: guest-capable (cart session), saved addresses require auth.
- **Validation:** `checkoutSchema` (`apps/api/src/routes/checkout.ts`) + `resolveShipping` (`lib/checkout.ts`): zone must exist with `status ACTIVE` and match address country; rate must exist for (zone, method) covering the subtotal.
- **Root cause:** client sent `shippingZoneCode: ''` when nothing was selected (or zones were empty); `''` passed the optional-string schema, then `resolveShipping` threw 400 `CHECKOUT_INVALID_ADDRESS`.
- **Fix:** `buildCheckoutInput()` omits blank optionals; schema rejects `''` explicitly (`.min(1)`); `review()` shows a controlled message when method/zone is unselected; methods/zones empty states render recoverable inline alerts. No hard-coded zones or rates.

## 7. Analytics

- **Request:** `GET /api/v1/admin/analytics/overview?from=2026-09-25&to=2026-09-27&compare=true` (operations-auth).
- **Validation:** `rangeSchema` requires `z.string().datetime({ offset: true })`; `compare` is `z.coerce.boolean()` (absent → `false`); `parseRange` enforces half-open `[from, to)`, ≤400 days, non-future start.
- **Root cause:** date-only `from`/`to` from `<input type="date">` failed the datetime schema → 400 before any data access.
- **Fix:** client-side `toAnalyticsDateTime()` maps `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00+03:00`, preserving the Africa/Nairobi convention (fixed UTC+3, no DST; half-open range; `to` exclusive per UI label). Backend validation deliberately unchanged. `compare=true`/`preset` handling verified aligned.

## 8. Cloudinary

- **Application defect:** none found. Signed-URL construction (`media/sign-upload` → direct XHR POST), response normalization, and failure taxonomy (`PROVIDER_REJECTED`, `UNEXPECTED_ASSET`, `NETWORK_ERROR`, …) verified in `apps/web/lib/media-upload.ts` with existing unit coverage.
- **Network/environment issue:** `ERR_INTERNET_DISCONNECTED` means the browser was offline; the helper surfaces "check your connection and try again" without stack traces. No architecture change made.

## 9. Tests

Added/updated (project conventions: `apps/web/lib/**/*.test.ts`, `apps/api/src/**/*.test.ts`; no new framework):

| Test file | Covers | Result |
| --------- | ------ | ------ |
| `apps/web/lib/analytics-api.test.ts` (new, 5) | Nairobi normalization, reported query shape, compare on/off, presets, empty query | PASS |
| `apps/web/lib/sessions.test.ts` (new, 4) | Envelope unwrap, bare array, malformed → `[]`, current/active/revoked | PASS |
| `apps/web/lib/price-display.test.ts` (new, 3) | Span root, no `<div>`, discounted, `<p>` composition | PASS |
| `apps/web/lib/checkout-input.test.ts` (new, 4) | Valid zone, blank omission, pickup/saved-address/notes, confirmation flag | PASS |
| `apps/api/src/routes/contracts.test.ts` (new, 6) | Date-only rejected / normalized accepted / compare default; blank zone rejected / omitted+valid accepted | PASS |
| `apps/api/src/lib/analytics/analytics.test.ts` (+1) | Nairobi round-trip `2026-09-25/27` → `2026-09-24T21:00Z/2026-09-26T21:00Z` | PASS |

Full suite: **250/251 PASS**; the single failure (`auth.test.ts` bcrypt, 5 s timeout under parallel load) passes in isolation (4.1 s) — environmental, unrelated to this phase.

## 10. Validation Commands

| Command | Result |
| ------- | ------ |
| `npm run typecheck` (api + web) | PASS, exit 0 |
| `npm run lint` (api + web) | PASS, 0 errors (1 pre-existing unused-var warning in `routes/storefront.ts`; pre-existing `<img>` warnings) |
| `npm test` (`vitest run`) | 250/251 PASS (see §9 for the environmental flake) |
| `npm run build` (api tsc + `next build`, 59/59 routes) | PASS, exit 0 (`ECONNREFUSED` log noise during prerender = build-time pages calling the non-running API; pre-existing graceful-degradation paths, untouched by this phase) |

Browser-flow verification (product edit → save/reload, security revoke, checkout zone select, analytics range, storefront navigation) was **NOT VERIFIED** — no browser harness is available in this environment; recommended before sign-off.

## 11. Remaining Issues

- Browser verification of the fixed flows (needs a running API + DB + browser harness). No known Phase A runtime blocker remains at the code level.
- Pre-existing, out-of-scope observations (not changed): `routes/storefront.ts` unused-var lint warning; `<img>` vs `next/image` warnings; `next build` while `next dev` runs can corrupt `.next` (per `DEV-RUNTIME-AUDIT.md`).
