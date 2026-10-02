# API

Fastify backend (`apps/api/src`). Base path `/api/v1` (dev: `http://localhost:3001`). All routes below are verified against `apps/api/src/routes/*.ts`. Auth cookie: `veyra_session` (`credentials: include` on web clients).

## Conventions

- JSON everywhere; errors uniform: `{ success: false, error: { code, message, details, requestId } }` (5xx never leaks internals).
- Request validation with Zod; pagination/filtering per route (admin page-size max 50).
- Rate limits: global 100 req/min/IP; auth endpoints 10/min; checkout/payment/refund/resend 30/min.
- Idempotency: `POST /checkout` requires `Idempotency-Key` header; refund creation requires an `idempotencyKey` body field; payment initiation uses idempotency keys; callbacks are idempotent by checkout request ID.
- Security headers via `@fastify/helmet`; CORS allowlist from `CORS_ORIGIN`.

## Route Inventory

Health: `GET /health`, `GET /ready`.

Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.

Public catalogue: `GET /catalog/products`, `GET /catalog/products/:id`.

Cart (guest-capable): `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:itemId`, `DELETE /cart/items/:itemId`, `DELETE /cart`, `GET /cart/validation`.

Wishlist (auth): `GET /wishlist`, `POST /wishlist/items`, `DELETE /wishlist/items/:itemId`.

Checkout + order lookup: `GET /checkout/options`, `POST /checkout/preview`, `POST /checkout`, `GET /orders/:orderNumber` (guest via confirmation token), `GET /orders/:orderNumber/delivery`, `GET /checkout/saved-addresses` (auth).

Payments: `POST /payments/mpesa/initiate`, `POST /payments/mpesa/callback`, `GET /payments/:paymentId/status`.

Customer account (auth, owner-scoped): `GET/PATCH /account/profile`, avatar finalize/remove (`POST/DELETE /account/profile/avatar`, Phase F — direct Cloudinary upload + server persistence), address CRUD + default (`/account/addresses…`), `GET /account/orders`, `POST /account/orders/claim`, `GET /account/orders/:orderNumber[/tracking]`, `POST …/reorder`, `GET /account/payments|returns|returns/:returnId|refunds|wishlist|security`, `POST /account/security/password`, `DELETE /account/sessions/others|/account/sessions/:id`, `GET/PATCH /account/preferences`, `POST /account/deactivate|/account/delete`, notifications (`GET /account/notifications[/unread-count]`, `POST …/read-all|…/:id/read`, `GET/PATCH /account/notification-preferences`).

Customer returns (auth): `POST/GET /returns`, `GET /returns/:returnId`.

Admin — catalogue/inventory: `GET/POST/PATCH /admin/products…`, manual variant create `POST /admin/products/:productId/variants` (v8-RC: `{ sku, price, …, attributeValues: [{ attributeId?, attributeValueId?, value? }] }` — mappings resolved against existing `AttributeValue` rows and persisted atomically with the variant + inventory + structured `VARIANT_CREATED` audit; missing/invalid/duplicate mappings rejected, `409` on duplicate SKU or combination), variant update, `POST /admin/products/:productId/variants/generate` (bulk variant generation: `{ attributes, allowList?, price?, brandCode?/brandValueId?, dryRun? }` → `{ created, existing, skipped, errors, summary }`; atomic, idempotent, `409 SKU_ALREADY_EXISTS` on foreign collisions), `PATCH /admin/products/:productId/variants` (bulk price/status update, ≤300 rows, one transaction), `POST …/variants/:variantId/barcode/generate|/assign` + `POST …/variants/barcodes/generate-missing` (server-authoritative barcodes; strict per-standard validation; explicit replace + reason), `GET /admin/inventory|/movements|/reservations`, `POST /admin/inventory/:variantId/restock|/adjust`, `POST /admin/inventory/restock-batch` (bulk restock, ≤100 items, one transaction with per-item `IN` movements), `GET /admin/inventory/lookup?barcode=` (scanner lookup → variant + SKU + inventory), category/collection CRUD (`GET/POST/PATCH`), attributes (`GET/POST /admin/attributes`, `POST /admin/attributes/:id/values`).

Admin — operations (staff+): `GET /admin/dashboard|/orders|/orders/:orderNumber|/payments|/customers|/customers/:id` (+ `PATCH`), `POST /admin/orders/:orderNumber/cancel` (unpaid/unfulfilled only; idempotent reservation release; paid/fulfilled refused), `GET /admin/audit-logs`, `GET /admin/reviews` + `POST …/moderate`, coupons `GET/POST/PATCH /admin/coupons`, `GET /admin/settings`, fulfillment queues (`GET /admin/fulfillments[/:orderNumber]`, `POST …/start|/pick|/pack`, `POST /admin/deliveries/:deliveryId/assign|/status`, `GET /admin/operations-users`), returns queue (`GET /admin/returns[/:returnId]`, `POST …/review|/approve|/reject|/receive|/inspect|/refund`), refund completion `POST /admin/refunds/:refundId/process` (admin+ only), notifications (`GET /admin/notifications`, `POST …/process|…/:id/resend`), provider delivery webhooks (`POST /webhooks/email/delivery`, `/webhooks/sms/delivery`, HMAC-verified).

Admin — analytics (staff+): `GET /admin/analytics/overview|/sales|/products|/categories|/customers|/inventory|/payments|/fulfillment|/delivery|/returns|/quality|/definitions`, `GET /admin/analytics/export/:report` (CSV).

## Authorization

`requireAuth` (valid unexpired session) → `requireOperationsAccess` (staff/admin/super_admin) → `requireFinancialAccess` (admin/super_admin, refund completion only). Customer resources are owner-scoped with DB-backed checks; guest orders require the confirmation token.

## What Is NOT Exposed

No public product search endpoint beyond the two catalogue reads (storefront discovery currently runs on static data — see [CATALOGUE.md](CATALOGUE.md)). No auto-disbursement refund endpoint (refunds complete manually).
