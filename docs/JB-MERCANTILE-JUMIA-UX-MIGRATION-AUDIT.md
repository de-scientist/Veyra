# JB Mercantile — Jumia-UX Migration Audit (Phase A)

> Phase A — audit only. No implementation in this phase. All claims verified by
> reading the repository on 2026-09-21. Anything not directly observed is marked
> `UNKNOWN — REQUIRES VERIFICATION`. Per AGENTS.md, internal identifiers still
> use `veyra` (`@veyra/*`, `veyra_session`, `veyra_dev`) — do not rename them,
> and never present them as the customer brand (JB Mercantile).

## 1. Current architecture

- Monorepo (`veyra-commerce`, private, workspaces `apps/*`, `packages/*`).
  Root scripts: `dev` (concurrently api+web), `build`, `lint`, `typecheck`,
  `test` (vitest), `db:generate`, `db:migrate` (`prisma migrate dev`),
  `db:seed` (`tsx prisma/seed.ts`), `health`.
- `apps/api` (`@veyra/api`, ESM): Fastify 4 + `@fastify/cookie,cors,helmet,
  rate-limit`, `@prisma/client@5.16`, `bcryptjs`, `zod`, `pino`.
  `src/app.ts` builds Fastify, registers cookie (`AUTH_SECRET`), CORS
  (`CORS_ORIGIN`, credentials, headers `Content-Type,Authorization,
  Idempotency-Key,X-Confirmation-Token,X-Provider-Signature`), helmet,
  rate-limit, error envelope
  `{ success, error: { code, message, details, requestId } }`; all routes under
  `/api/v1`. Files: `server.ts`, `lib/prisma.ts`, `lib/env.ts`, `lib/logger.ts`,
  `lib/errors.ts`, `lib/rateLimits.ts`, `types/api.ts`.
- `apps/web` (`@veyra/web`): Next.js 14.2.15 + React 18.3.1,
  `@tanstack/react-query`, `zustand`, `zod`, `react-hook-form` declared in
  `package.json` but **zero** `QueryClient/useQuery/useMutation/zustand/
  createStore` usage found in `apps/web` — state is `useState+useEffect` + URL
  params. No `shadcn`/`@radix`; styling is custom tokens in
  `app/globals.css` (Tailwind installed but not the styling mechanism).
- `packages/types|validation|config`: private ESM stubs
  (`main: ./src/index.ts`, sources `packages/*/src/index.ts` only).
- PostgreSQL single source of truth. Currency hardcoded KES
  (`Order.currency=KES`, seed shipping 500 KES). Single-store D2C.
- Prisma: `prisma/schema.prisma` (1206 lines, 52 models, 26 enums — see §5);
  10 forward-only SQL migrations (`20260917_init`, `phase5_cart_wishlist`,
  `phase6_checkout_order`, `phase7_payments_mpesa`, `phase8_fulfillment_delivery`,
  `phase9_returns_exchanges_refunds`, `phase10_customer_account`,
  `phase11_notifications`, `phase12_admin`, `phase13_analytics`).
  Seed `prisma/seed.ts` only: roles `admin,staff,customer,super_admin`;
  11 permissions; admin user `admin@veyra.local`; `Category(apparel)`;
  `ShippingZone(KE-NAIROBI)` + `ShippingMethod(COURIER)` + rate 500 KES.

## 2. Current UI structure

- `app/layout.tsx`: `ThemeScript` + `ThemeProvider` + `ToastProvider` +
  `Header` + `#main-content` + `Footer`, skip-link, JSON-LD
  (`Organization`, `WebSite`), icons `/jb-logo.png`.
- `components/Header.tsx` (`site-header`): **static** `Sign in → /login`,
  **not session-aware, no avatar**. Cart count via `getCart()`, unread count via
  `getUnreadCount()` polled 60s. Desktop mega-menu from
  `lib/catalog.ts:departments/getDepartmentCategories` (static demo data);
  mobile `#jb-mobile-nav` non-modal disclosure (Escape returns focus, no trap).
  `ThemeToggle compact`.
- Auth-state lives elsewhere only: `components/AccountNav.tsx`
  (`getSessionUser()+can('dashboard.read')` gates `Admin Dashboard` entry),
  `app/admin/AdminShell.tsx` (`isOperationsRole` gate), `components/AuthForms.tsx`.
- Design system: `components/jb-ui.tsx` (`PageHeader/EmptyState/ErrorState/
  LoadingSkeleton/StatusBadge`), `components/admin.tsx` (`AdminStatCard/
  AdminPagination/AdminEmptyState/ConfirmAction`), `JBLogo.tsx`
  (compact→`/jb-navbar.png`, full→`/jb-logo.png`; white chip in dark mode),
  `JBIcons.tsx` (single `JBIcon`, ~30 paths, no emoji icons),
  `ConfirmDialog.tsx` (`JBConfirmDialog` + `useConfirm`; no `window.confirm`
  found), `a11y.tsx` (single `useModalFocus` primitive).
- Theme: `globals.css` Design System v2 Royal Blue + White,
  `:root/[data-theme=light|dark]`, dark navy (not invert), `:focus-visible`,
  `prefers-reduced-motion`; `ThemeProvider.tsx` (`light|dark|system`,
  `localStorage:jb-mercantile-theme`, blocking anti-flash script,
  `matchMedia` listener; toggle is `menu/menuitemradio` with
  Arrow/Escape/Tab handling).

## 3. Current routes

Frontend (`apps/web/app/`):
- Storefront: `/`, `/shop` (dept/category/facet/sort/page via
  `parseDiscoveryQuery`), `/products/[slug]`, `/categories/[slug]`,
  `/collections/[slug]`, `/search`, `/cart`, `/checkout`,
  `/order-confirmation/[orderNumber]`, `/wishlist`, `/login`, `/register`,
  `/returns`, `robots.ts`, `sitemap.ts`.
- Account (`app/account/` + `AccountNav`): `/account`, `/account/profile`,
  `/addresses`, `/orders`, `/orders/[orderNumber]`,
  `/orders/[orderNumber]/tracking`, `/returns`, `/returns/[returnId]`,
  `/refunds`, `/payments`, `/wishlist`, `/security`, `/preferences`,
  `/notifications`.
- Admin (`app/admin/` → `AdminShell`, `robots:noindex`): `/admin`,
  `/dashboard`, `/analytics` (+`sales|products|inventory|returns|fulfillment|
  delivery|quality|definitions|customers|payments|reports`), `/orders`,
  `/orders/[orderNumber]`, `/payments`, `/fulfillment`, `/products`,
  `/products/new`, `/products/[id]`, `/inventory`, `/inventory/movements`,
  `/returns`, `/customers`, `/customers/[id]`, `/reviews`, `/coupons`,
  `/notifications`, `/audit-logs`, `/settings`, `/unauthorized`.
- **Missing admin pages:** no `app/admin/categories|collections|attributes`
  pages (API exists; only surfaced as `<select>` in product forms).

API (`/api/v1`, `apps/api/src/routes/`):
- `health.ts`: `GET /health`, `GET /ready`.
- `catalogue.ts`: public `GET /catalog/products`, `GET /catalog/products/:id`;
  admin (`requireOperationsAccess`): `GET/POST/PATCH /admin/products…`,
  `POST /admin/products/:productId/variants`,
  `PATCH /admin/products/:productId/variants/:variantId`,
  `GET /admin/inventory`, `GET /admin/inventory/movements`,
  `GET /admin/inventory/reservations`,
  `POST /admin/inventory/:variantId/restock|/adjust`,
  `GET/POST/PATCH /admin/categories`, `GET/POST/PATCH /admin/collections`,
  `GET/POST /admin/attributes`, `POST /admin/attributes/:id/values`.
  No `PUT/DELETE /admin/products` (PATCH status only); no public
  category/collection listing (only admin + `catalog/products`).
- `shopping.ts` (cart guest-capable; wishlist `requireAuth`),
  `checkout.ts` (Idempotency-Key required), `payments.ts` (M-Pesa
  initiate/callback/status), `fulfillment.ts`, `returns.ts`
  (financial gate only on refund-process), `account.ts` (`/account*` profile,
  addresses, orders, payments, security, preferences, sessions, deactivate/
  delete), `notifications.ts`, `admin.ts` (dashboard, orders, payments,
  customers, audit-logs, reviews, coupons, roles via `requireSuperAdmin`,
  settings GET), `analytics.ts`.

## 4. Current API routes — see §3.

## 5. Current database entities

52 models, 26 enums (`prisma/schema.prisma`). Catalogue-relevant:
- `User(id,email unique,passwordHash,firstName,lastName,phone,avatarUrl?,
  status,…)`, `Session(id,userId,tokenHash unique,expiresAt,revokedAt,…)`,
  `Role/Permission/UserRole/RolePermission`.
- `Category(id,name,slug unique,description?,parentId?(self-hierarchy),
  status String default ACTIVE,deletedAt?)`, `Collection(…status,deletedAt?)`,
  `ProductCollection(productId+collectionId unique)`.
- `Product(id,name,slug unique,status DRAFT|ACTIVE|ARCHIVED,basePrice?,
  categoryId?,deletedAt?)`, `ProductVariant(id,productId,sku unique,
  status ACTIVE|INACTIVE|ARCHIVED,priceOverride?,compareAtPrice?,
  isDefault,archivedAt?,deletedAt?)`.
- `ProductImage(id,productId,variantId?,url,altText?,isPrimary,sortOrder,
  createdAt)` — **no `publicId/secureUrl/width/height/format/updatedAt`**.
  `variant.variantId` FK `ON DELETE SET NULL`; product FK cascade.
- `Attribute(id,name,slug unique,type default STRING)`,
  `AttributeValue(attributeId+value unique)`, `VariantAttributeValue`
  (duplicate-combo prevention UNKNOWN — REQUIRES VERIFICATION).
- `Inventory(variantId unique,quantityOnHand,quantityReserved,
  lowStockThreshold)`, `InventoryMovement`, `InventoryReservation`.
- Commerce: `Cart/CartItem`, `Order/OrderItem/OrderStatusHistory`,
  `CheckoutIdempotency`, `Payment/PaymentTransaction`,
  `ReturnRequest/ReturnItem/…`, `Exchange/Refund/RefundTransaction`,
  `Address/ShippingZone/ShippingMethod/ShippingRate/Delivery/…`,
  `Coupon/CouponUsage`, `Wishlist/WishlistItem`, `Review`,
  `Notification*`, `UserPreference`, `AuditLog`.
- `User` has `avatarUrl String?` only — **no avatar public-ID field**.
  `UserRoleName` enum (`CUSTOMER,STAFF,ADMIN,SUPER_ADMIN`) exists in schema
  but code uses string slugs — unused-enum debt.

## 6. Current product architecture

- Backend catalogue service + zod validation in `routes/catalogue.ts`
  (products, variants, inventory, categories, collections, attributes).
  Safe semantics: PATCH status (`DRAFT/ACTIVE/ARCHIVED`) rather than
  hard-delete; `deletedAt` on Product/Variant/Category/Collection.
- Frontend storefront is **static-demo-data driven**:
  `lib/catalog.ts` + `lib/storefront-data.ts` shim (13 products, 3 depts,
  9 cats, 5 collections, `ATTRIBUTE_REGISTRY`); cutover comment lists
  `GET /catalog/*`, `/admin/*` but backend is **not wired to storefront
  listing pages**. Filters derive from the static `ATTRIBUTE_REGISTRY`,
  not from DB attributes.
- Admin product UI: list + search/status/category filter + PATCH
  Archive/Restore; `new` (POST `name/desc/slug/categoryId/status`);
  `[id]` edit (`name/desc/categoryId/status`) + variant create
  (`sku/name/price/single attributeId+value`) + price update.
  No bulk edit; single attribute-value per variant create in UI.
- SEO: product/category metadata, canonical, OG, sitemap, robots
  (admin `noindex`) — NOT VERIFIED field-by-field.

## 7. Current image architecture

- `ProductImage.tsx`: `next/image` (lazy unless eager), branded fallback
  on `!src/onError` (never broken). `ProductGallery.tsx`: main + thumbs.
  `next.config.mjs:images.remotePatterns=[images.unsplash.com]` only, with
  comment that production should extend (e.g. Cloudinary) via deployment config.
- DB stores `url` only (no provider metadata). Images are **read-only display**
  in web; **no upload/media-manager form** exists. Demo imagery is Unsplash.
- Local/static assets: only `public/jb-navbar.png`, `public/jb-logo.png`
  (brand). No product image migration inventory exists.

## 8. Current authentication architecture

- Cookie-session: `POST /auth/register` (auto-assigns `customer`),
  `POST /auth/login` (both rate-limited), `POST /auth/logout`,
  `GET /auth/me`. Cookie `veyra_session`, httpOnly, lax, secure in
  production, 7d. `lib/auth.ts` bcrypt-12 + SHA256(`AUTH_SECRET:token`);
  `middleware/auth.ts:requireAuth` (manual cookie parse,
  `Session(tokenHash,revokedAt=null,expiresAt>now)` + ACTIVE-only users).
- Frontend `AuthForms.tsx` (`/auth/login`, `/auth/register`,
  single-`/` `safeRedirectTarget`). Header is **not session-aware** (§2).

## 9. Current RBAC architecture

- Canonical `lib/permissions.ts`: `SUPER_ADMIN_SLUGS`, `OPERATIONS`
  (staff,admin,super_admin), `FINANCIAL` (admin,super_admin),
  18 slugs (`dashboard.read,products.manage,inventory.manage,
  categories.manage,collections.manage,orders.manage,fulfillment.view/process,
  delivery.manage,refunds.process,customers.read/manage,users.manage,
  roles.manage,notifications.read/manage,audit.read,analytics.read,
  settings.manage`). `getUserPermissionSlugs` DB-authoritative per request;
  super_admin → `['*']`.
- Middleware: `requireRole`, `requireOperationsAccess`,
  `requireFinancialAccess` (=admin gate), `requireAdminAccess`,
  `requireSuperAdmin` (role assignment, self-lockout guard),
  `requirePermission(...slugs)`.
- Debt: seed omits newer slugs (`dashboard.read,refunds.process,
  customers.*,users.manage,roles.manage,analytics.read,settings.manage`)
  from grants — super_admin wildcard compensates at runtime; `UserRoleName`
  enum unused; frontend `can()` in `admin-api.ts` is UX-only (backend
  authoritative — correct pattern, but menu-hiding ≠ authz must be kept).
- Tests: `rbac.test.ts`, `lib/auth.test.ts`, `lib/env.test.ts`,
  `security.test.ts` (+11 other suites, all API-side; **zero web tests**).

## 10. Current admin access

- `AdminShell` gates on `isOperationsRole` → `/login?redirect=` or
  `/admin/unauthorized`. Permission-aware entries via `can()`.
  Backend independently enforces per route (§9). Admin pages listed in §3.

## 11. Current CRUD coverage

| Entity | Backend API | Admin UI | Notes |
|---|---|---|---|
| Product | POST/GET/PATCH status | list/create/edit/archive/restore | No hard DELETE; SEO fields NOT VERIFIED |
| Category | GET/POST/PATCH | **no dedicated page** (select only) | reorder/visibility NOT VERIFIED |
| Collection | GET/POST/PATCH | **no dedicated page** | product membership mgmt NOT VERIFIED |
| Attribute | GET/POST attrs, POST values | **no dedicated page** | no update/delete endpoints |
| Attribute value | POST | **none** | no update/delete endpoints |
| Variant | POST/PATCH | create + price/status | single attr-value per create in UI; dup-combo guard NOT VERIFIED |
| Product image | **none** | read-only display | no upload/reorder/primary/variant-assign/delete |
| Inventory | restock/adjust + movements/reservations reads | restock/adjust + movements list | `available=onHand−reserved` derived; reservations UI unused |
| User profile | GET/PATCH `/account/profile` (name/phone; email read-only) | full pages (profile/addresses/security/prefs) | **no avatar upload** |
| Profile image | **none** | **none** | `avatarUrl` read in types, never rendered/edited |

## 12. Current Cloudinary integration

**MISSING.** Zero `cloudinary` SDK/URL/env references in `apps/api`,
`apps/web`, or `.env.example` (verified by grep). `lib/env.ts` (zod) has no
`CLOUDINARY_*`. Stale-doc flag: `docs/ENVIRONMENT.md` and `docs/ARCHITECTURE.md`
claim `CLOUDINARY_*` vars exist in `.env.example` — the current 30-line
`.env.example` contains **none** (docs predate the file or vice versa).
`docs/CATALOGUE.md` correctly notes "no wired usage found — NOT VERIFIED".
Required: new `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET/UPLOAD_FOLDER`
config + signed-upload flow + media service + `publicId`-style metadata
(schema change, §5 gap).

## 13. Current profile management

`GET/PATCH /account/profile` (`firstName/lastName/phone`; email disabled
read-only) + addresses CRUD + default, password change, session revocation,
4 email prefs + notification matrix, deactivate/delete. `avatarUrl` present
in DTOs/types but never rendered or editable anywhere in web.

## 14. Current navbar authentication state

**Static.** `Header.tsx` always shows `Sign in → /login`; no session fetch,
no avatar, no initials fallback, no account dropdown. `AccountNav` (account
area only) is the sole session-aware menu. Requirement §21/§22 states
(MISSING) in the header.

## 15. Existing technical debt

1. Storefront on static demo data (`catalog.ts`/`storefront-data.ts`); backend
   catalogue not wired to listing/discovery pages.
2. Filters from static `ATTRIBUTE_REGISTRY`, not DB attributes.
3. No `admin/categories|collections|attributes` pages despite working APIs.
4. Attribute/value update/delete endpoints absent.
5. `ProductImage` lacks provider metadata (`publicId`, dimensions, format,
   `updatedAt`); `User` lacks avatar provider field.
6. Cloudinary entirely absent (config, SDK, flow, validation, cleanup).
7. Header not session-aware; no avatar/initials/dropdown anywhere in header.
8. React Query/Zustand/RHF declared but unused in web (dead deps or future use).
9. Seed permission grants lag `PERMISSIONS` catalog (relies on super-admin
   wildcard); `UserRoleName` enum unused.
10. Stale docs claim Cloudinary vars in `.env.example` (false at audit time).
11. `APP_URL` duplicated in `.env.example`; sender defaults + seed admin still
    carry historic brand (`Veyra`/`veyra.local`) — business decision pending.
12. `RETURN_WINDOW_DAYS` read by code, missing from `.env.example`.
13. Zero web tests; all vitest suites are API-side.
14. `next/image` remote patterns allow only Unsplash (blocks Cloudinary
    delivery until deployment config updated).

## 16. Missing functionality (maps to brief §§1/6–28)

Product/collection/attribute image upload-replace-delete-reorder-assign (all);
signed Cloudinary flow + env validation; media service + Cloudinary destroy
lifecycle; category/collection/attribute(-value) admin pages; attribute
update/delete API; public category/collection listing API; product hard/soft
delete semantics beyond PATCH status; variant duplicate-combo/SKU UI guards;
profile avatar upload/replace/remove + navbar avatar + initials fallback +
account dropdown; DB-driven nav/homepage/collections; search back-end wiring
(web search page vs demo data — NOT VERIFIED); inventory reservations UI;
roles/users admin UI (API super-admin only); media E2E/tests.

## 17. Broken functionality

None proven broken by static audit — catalogue/auth/RBAC/inventory flows are
implemented and unit-tested API-side. The following are **absent, not broken**:
Cloudinary, header session state, avatar. Storefront-vs-DB wiring is
**divergent by design** (demo-data shim), not a runtime break.
Runtime verification (typecheck/lint/tests/build/E2E) was out of scope for
Phase A and is NOT VERIFIED.

## 18. Duplicated functionality

- `storefront-data.ts` compatibility shim over `catalog.ts` (intentional, marked).
- `middleware/operations.ts` re-exports auth middleware (thin, harmless).
- `can()` (web, UX-only) vs backend `requirePermission*` (authoritative) —
  correct separation, not duplication, provided no one mistakes hiding for authz.
- `UserRoleName` enum vs string slugs (schema/code divergence, §9).

## 19. Security concerns (to enforce in later phases)

1. New media endpoints must enforce authN + ownership + role/permission +
   MIME/size/dimension validation server-side; never trust client validation.
2. Never expose `CLOUDINARY_API_SECRET`; signed uploads only for
   protected/admin flows.
3. IDOR/BOLA: users must not modify another user's avatar; customers must not
   touch product media; variant `variantId` scoping on image assign.
4. Privilege escalation: never trust client-submitted
   `roleId/permissionId/isAdmin/isSuperAdmin` (current code does not — keep it).
5. Cloudinary destroy must be authorized + audited; avoid orphaned assets and
   unsafe immediate deletes (decide per-entity lifecycle).
6. `M-Pesa` callback trust boundary already exists — keep frontend payment
   state untrusted (only verified callbacks → PAID).
7. Secrets hygiene: `.env` present locally — never commit; new Cloudinary vars
   must enter `.env.example` as placeholders only.
8. Historical integrity: no hard-delete of order-dependent rows; media removal
   must handle primary-image reassignment + variant references.

## 20. Recommended migration plan (maps to brief Phase B–I)

- **B — Design system & shell:** keep tokens/`JBLogo`/`JBIcon`/`useModalFocus`/
  `JBConfirmDialog`/theme; make `Header` session-aware (avatar/initials/
  dropdown, permission-gated Admin entry); DB-driven nav with static-dept
  fallback; responsive/mobile nav audit.
- **C — Cloudinary foundation:** `CLOUDINARY_*` env + zod startup validation
  (fail-safe in prod, clear error in dev); `cloudinary` SDK server-side only;
  signed-upload endpoint (`media.upload` permission / ownership for avatars);
  folders `jb-mercantile/products|variants|profiles`; remote-patterns update.
- **D — Product media:** Prisma migration (`publicId`, `secureUrl`/`width`/
  `height`/`format`, `updatedAt` — avoid duplicate model); media service
  (persist/primary-reassign/reorder/variant-assign/destroy+cleanup); admin
  media manager (dnd, progress, retry, validation, alt text).
- **E — Catalogue CRUD:** admin pages for categories/collections/attributes
  (+values); attribute update/delete API; public listing APIs; wire storefront
  discovery (search/filter/sort/pagination) to backend; variant guards
  (dup SKU/combo); inventory reservations surface.
- **F — Profile media:** avatar signed-upload/replace/remove; `User`
  provider-field migration; navbar sync via `/auth/me` refetch; orphan-asset
  compensation path.
- **G — Storefront redesign:** DB-driven home/shop/category/collection/search/
  PDP (variant→SKU/price/availability/image), wishlist/cart already live.
- **H — Admin UX:** permission-aware nav (hiding ≠ authz); catalogue/inventory/
  media/customers/orders coverage; audit logging on media/admin ops.
- **I — Testing & hardening:** extend vitest (media authz, primary-image
  behaviour, avatar ownership, inventory negatives, RBAC matrix) + Playwright
  customer/admin/authz journeys; run `npm run typecheck`, `npm run lint`,
  `npm test`, web build; update docs + env example.

## 21. Requirement classification

| # | Requirement (brief §1 + elaborations) | Status | Evidence |
|---|---|---|---|
| 1 | Marketplace-quality shopping experience | PARTIALLY IMPLEMENTED | Discovery UI exists on demo data; DB wiring missing (§6) |
| 2 | Redesigned JB UI/UX | PARTIALLY IMPLEMENTED | DS v2 + tokens + header/footer exist; header not session-aware |
| 3 | Responsive desktop/tablet/mobile | PARTIALLY IMPLEMENTED | Responsive shell + mobile nav exist; 320px→large-desktop NOT VERIFIED |
| 4 | Functional catalogue management | PARTIALLY IMPLEMENTED | API + partial admin UI (§11); category/collection/attr pages missing |
| 5 | Product CRUD | PARTIALLY IMPLEMENTED | POST/GET/PATCH + admin pages; no DELETE semantics beyond archive |
| 6 | Category CRUD | PARTIALLY IMPLEMENTED | API GET/POST/PATCH; no admin UI; no delete/reorder/visibility |
| 7 | Collection CRUD | PARTIALLY IMPLEMENTED | API GET/POST/PATCH; no admin UI; membership/reorder NOT VERIFIED |
| 8 | Attribute/value CRUD | PARTIALLY IMPLEMENTED | Create+read API only; no update/delete; no admin UI |
| 9 | Variant CRUD | PARTIALLY IMPLEMENTED | POST/PATCH API + basic UI; dup-combo guard NOT VERIFIED; single-attr UI |
| 10 | Inventory management | IMPLEMENTED | restock/adjust + movements + `available` derivation + UI |
| 11 | Product image upload to Cloudinary | MISSING | No code/config (§12) |
| 12 | Product image replacement | MISSING | No endpoints/UI |
| 13 | Product image deletion (+Cloudinary destroy) | MISSING | No endpoints/UI |
| 14 | Product image reordering | MISSING | `sortOrder` stored, no management API/UI |
| 15 | Image assignment to products/variants | PARTIALLY IMPLEMENTED | `variantId?` FK exists; no assign API/UI |
| 16 | Profile image upload to Cloudinary | MISSING | `avatarUrl` field only; no flow |
| 17 | Profile image replacement/deletion | MISSING | No endpoints/UI |
| 18 | Navbar avatar (authenticated) | MISSING | Static Sign-in link (§14) |
| 19 | Fallback avatar | MISSING | No avatar rendering anywhere |
| 20 | Light/Dark/System theme | IMPLEMENTED | `ThemeProvider` + tokens + toggle (§2) |
| 21 | Accessibility | PARTIALLY IMPLEMENTED | Focus/skip-link/ARIA/skeletons/contrast by construction; no audit run |
| 22 | Secure RBAC enforcement | IMPLEMENTED | DB-authoritative middleware + tests (§9) |
| 23 | Admin/staff/customer separation | IMPLEMENTED | Operations/financial/super-admin tiers + gates |
| 24 | Loading/empty/error/success states | PARTIALLY IMPLEMENTED | `EmptyState/ErrorState/LoadingSkeleton`/toasts exist; coverage NOT VERIFIED per screen |
| 25 | No fake functionality | NOT VERIFIED | No runtime pass; demo-data shim is declared, not hidden |
| 26 | No mock CRUD | PARTIALLY IMPLEMENTED | Real APIs where present; missing areas have no fake buttons (absent, not mocked) |
| 27 | Backend as source of truth | PARTIALLY IMPLEMENTED | True API-side; storefront reads demo data, not backend |
| — | Search (proper, URL-state, paged) | NOT VERIFIED | `/search` page exists on demo data; backend wiring NOT VERIFIED |
| — | PDP variant→SKU/price/availability/image | NOT VERIFIED | PDP exists; variant-effect behaviour NOT VERIFIED |
| — | SEO (meta/OG/sitemap/robots/structured) | NOT VERIFIED | Stated in reports; field-by-field NOT VERIFIED |
| — | Performance (Cloudinary transforms/lazy) | PARTIALLY IMPLEMENTED | Lazy + fallback exist; Cloudinary transforms MISSING |
| — | E2E tests | MISSING | No Playwright/web tests; vitest API-only |

## 22. Test/verification status at audit time

No commands were executed in Phase A (audit-only). The following are
NOT VERIFIED and must be run in Phase I: `npm run typecheck`, `npm run lint`,
`npm test`, web build, E2E. Existing suites (API-side, ~14 files) are listed
in §9; web has zero tests.

## 23. Audit verdict

The backend catalogue/auth/RBAC/inventory foundation is real and worth
preserving; the storefront shell, design tokens, theme, and a11y primitives
are real. The migration work is: (a) Cloudinary + media lifecycle (greenfield),
(b) header auth/avatar (greenfield), (c) category/collection/attribute admin
pages + attribute update/delete (gap-fill), (d) storefront cutover from demo
data to backend catalogue (largest UX lift), (e) profile avatars + navbar sync,
(f) tests + docs. No database reset is required; all schema changes must be
forward-only migrations.
