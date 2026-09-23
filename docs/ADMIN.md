# Admin & Operations

RBAC-gated operations platform at `/admin/*` (staff+; financial completion admin+; role administration super-admin only). The admin is never a second source of truth — it administers the same PostgreSQL data as the storefront. Client-side gating is UX-only; every endpoint re-authorizes server-side.

## Access

- Entry: `/admin` redirects to the canonical dashboard at `/admin/dashboard`.
- Unauthenticated visitors are sent to `/login?redirect=/admin/...`; authenticated users without dashboard permission land on `/admin/unauthorized` (403, no internals leaked).
- The account navigation shows an **Admin Dashboard** entry only for sessions with `dashboard.read`.
- Role/permission administration (`GET /admin/roles`, `POST /admin/users/:id/roles`) is super-admin only; the first super-admin is promoted via documented SQL (see [AUTHENTICATION.md](AUTHENTICATION.md)) — never a default password.

## Surfaces

- **Dashboard** (`/admin/dashboard`): needs-attention, commerce overview, operations, inventory, customers.
- **Catalogue** (`/admin/products`, `/new`, `/[id]`): product/variant CRUD, status, pricing; categories, collections, attributes.
- **Inventory** (`/admin/inventory`, `/movements`): stock levels, restock/adjust (audited), movement trail, reservations view.
- **Orders** (`/admin/orders[/[orderNumber]]`): order search, detail, status dimensions.
- **Payments** (`/admin/payments`): read-only visibility; state changes only via verified callbacks or audited refunds.
- **Fulfillment** (`/admin/fulfillment`): start/pick/pack, courier assignment, delivery status.
- **Customers** (`/admin/customers[/[id]]`): search, suspend/reinstate, detail.
- **Reviews** (`/admin/reviews`): moderation queue.
- **Coupons** (`/admin/coupons`): create/edit/disable. Coupon redemption paths were not traced — PARTIALLY IMPLEMENTED.
- **Notifications** (`/admin/notifications`): delivery queue, retry/resend, outbox drain.
- **Settings** (`/admin/settings`): operational settings view.
- **Audit logs** (`/admin/audit-logs`): append-only actor/action/entity/IP trail.

## Analytics (`/admin/analytics/*`)

Sales, products, categories, customers, inventory, payments, fulfillment, delivery, returns, quality, metric definitions, and CSV report exports (audited). Africa/Nairobi timezone; preset/relative/custom ranges. Thresholds (e.g. high-value KES 20,000, inactive 90 days) are technical defaults — REQUIRES BUSINESS DECISION.

## Destructive Actions

All destructive/operational confirmations use the shared `JBConfirmDialog` (alertdialog, focus trap, Escape, loading guard, inline API errors) — never `window.confirm`. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
