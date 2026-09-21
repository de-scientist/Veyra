# Phase D Report — Product Media, Cloudinary Integration & Complete Product Image CRUD

## 1. Executive Summary

Phase D delivered the complete product-image lifecycle on the Phase C
foundation: extended `ProductImage` with provider metadata (forward-only
migrations, zero data loss), a transactional domain service, seven
operations-guarded endpoints, and an accessible admin media manager
(upload + progress + retry, preview, primary, keyboard reorder, alt-text
editing, replace, confirmed delete) integrated into the product editor.
PostgreSQL remains the source of truth for ownership/primary/order;
Cloudinary stores the bytes.

## 2. Existing ProductImage Model

`id, productId, variantId?, url, altText?, isPrimary, sortOrder, createdAt`;
product FK cascade, variant FK SET NULL; zero rows in dev at migration time
(verified). No upload/delete/reorder workflows existed.

## 3. Database Changes

- Migration `20260921_phase14_product_media` (applied): nullable
  `publicId/secureUrl/width/height/format/bytes`, `updatedAt`
  (backfilled `CURRENT_TIMESTAMP`), `(productId, sortOrder)` index, partial
  unique index `(productId) WHERE isPrimary` (Prisma cannot express it —
  documented in-schema).
- Migration `20260921_phase14b_product_media_audit` (applied): six
  `AuditAction` values (precedent: phase13 pattern).
- `url` retained and mirrored from `secureUrl` on create/replace, so legacy
  readers and the public catalogue endpoint keep working; display resolves
  `secureUrl ?? url`. No backfill invented; no Unsplash migration.
- Client regenerated (`prisma@5.22.0 generate`; root `prisma@8 RC` no longer
  ships `generate`/`migrate` — documented toolchain note); `prisma validate`
  clean. No reset, no history rewrite.

## 4. Cloudinary Integration

Phase C provider reused untouched (one contract-shape mapping added:
camelCase HTTP ↔ snake_case provider, `resource_type` server-asserted).
Variant-image column preserved: API accepts an optional `variantId`
validated to the same product (UI stays product-level — variant UI
DEFERRED, API support IMPLEMENTED).

## 5. Upload Flow

File select/drop → client MIME pre-check → `sign-upload` (product context,
operations) → direct Cloudinary upload with real XHR progress (max 3
parallel) → `normalizeUploadResult` server-side → `ProductImage` created
(first → primary/order 0; later → secondary/next order; client
isPrimary/sortOrder never trusted) → grid refreshes. Local blob previews
revoked after use. Product form and media stay separate payloads.

## 6. Product Media API

All under `/admin/products/:productId/images`, all `requireOperationsAccess`:

| Operation | Endpoint | Notes |
| --- | --- | --- |
| List | `GET …/images` | sortOrder order |
| Create | `POST …/images` | validated result, limit 20 (409), archived → 409 |
| Update | `PATCH …/images/:imageId` | altText only (≤200); provider fields stripped |
| Primary | `POST …/images/:imageId/primary` | unset-all + set transaction |
| Reorder | `PATCH …/images/reorder` | complete-set, transactional |
| Replace | `POST …/images/:imageId/replace` | identity preserved, old asset cleaned post-commit |
| Delete | `DELETE …/images/:imageId` | DB-first, promote next, cleanup reported |

## 7. CRUD Matrix

Create YES / Read YES / Update-alt YES / Primary YES / Order YES / Replace
YES / Delete YES / Bulk reorder YES / Cloudinary cleanup YES (reported
`deleted|failed|skipped`, never hidden) / Ownership validation YES.

## 8. Primary Image Rules

First image primary@0; exactly one primary (partial unique index +
transactions); set-primary is unset-all + set.

## 9. Ordering Rules

Pattern A: primary independent of position; reorder persists dense
`sortOrder` for the exact full set (duplicates/foreign/partial → 400).

## 10. Replacement Strategy

Update-in-place (keeps id/primary/order/variant); new asset validated
first; old asset destroyed only after commit; failure leaves old image
usable and reports `providerCleanup`. Chosen over create+remove to preserve
references and ordering.

## 11. Deletion Strategy

Verify → delete row (+ promote lowest sortOrder if primary was removed) →
`destroyMedia` best-effort. DB correct even when provider cleanup fails
(reported + logged + audited). Legacy `url`-only rows skip provider delete
(`skipped`). Double delete → idempotent 404 (P2025 mapped, never 500).

## 12. Authorization

Operations roles only (staff/admin/super-admin via existing
`requireOperationsAccess`); guests 401, customers 403 on all seven routes.
DRAFT/ACTIVE mutable, ARCHIVED read-only (409). No new permissions, no
`role ===` branches, no client-trusted fields.

## 13. IDOR/BOLA Protections

Every mutation re-verifies product→image (and variant→product) ownership;
cross-product IDs → 404 without leaking existence; tested for
update/delete/primary/replace/reorder paths.

## 14. Orphan Media Strategy

Create-failure after upload → best-effort `destroyMedia` then rethrow
(logged as `media.orphan_cleanup_failed`). Abandoned uploads (user cancels
editor) remain identifiable by server-namespaced public IDs; no automatic
reaper (documented). No atomicity claimed across PostgreSQL + Cloudinary.

## 15. Accessibility

Keyboard file input + labelled dropzone; per-file `progressbar` roles and
polite live queue; button-based reorder (Prev/Next; First/Last via ends),
no drag-only paths; `JBConfirmDialog` (alertdialog, Escape, focus restore)
for delete; toasts via existing provider; PRIMARY badge is text + icon
(not color-only); visible focus tokens; SVG icons only; no
`window.confirm`.

## 16. Responsive UX

3-col → 2-col grid (900px/640px), token-only styles, no overflow; theme
comes from existing tokens (no new colors).

## 17. Testing

API (`product-media.test.ts`, 14): auth matrix, CRUD, primary invariant,
atomic reorder (+rejections), replace-with-cleanup, primary-promotion
delete, concurrent primaries (single winner), double delete (200+404),
IDOR/BOLA, tamper stripping, archived/404 guards. Web
(`cloudinary-display.test.ts`, 3): presets, legacy passthrough,
no-double-apply. Full `npm test`: 21 files / 174 tests — 173 pass; the single failure is
the known pre-existing bcrypt timeout flake under parallel load (passes
isolated; untouched by Phase D). UI interaction (upload/reorder/delete
clicks, viewports, themes, screen reader) is code-reviewed; browser
execution was not available in this environment — recommended pre-release.

## 18. Performance

Thumbnails via fixed `c_limit,w_400` presets (detail `w_1200` on expand);
max 3 parallel uploads; no binaries through Fastify; indexed ordered reads;
no N+1 (single-row + set operations).

## 19. Known Limitations

- 20-image cap is an operational safeguard, not a business rule.
- Declared upload MIME/bytes remain advisory until server finalization
  (Phase C limitation, unchanged).
- `overwrite` unsigned (UUID rationale, unchanged from Phase C).
- No orphan reaper; no AVIF; no variant-image UI; product archive keeps
  images (historical/admin availability); order snapshots decoupled from
  mutable images (no order code touched).
- One unstaged web comment edit may remain in the tree (commits are
  environment-managed; not requested).

## 20. Files Changed

- `prisma/schema.prisma`, `prisma/migrations/20260921_phase14{,_product_media_audit}/migration.sql`
- `apps/api/src/lib/media/products.ts` (new domain service)
- `apps/api/src/routes/product-media.ts` (new), `apps/api/src/app.ts`
- `apps/api/src/routes/product-media.test.ts` (new, 14 tests)
- `apps/web/lib/admin-api.ts` (image client), `apps/web/lib/cloudinary-display.ts` (+ test)
- `apps/web/components/ProductMediaManager.tsx` (new)
- `apps/web/app/admin/products/[id]/page.tsx` (Media section), `apps/web/app/globals.css`
- `docs/CLOUDINARY.md`, `docs/PHASE-D-REPORT.md`

## 21. Phase Status

Acceptance criteria (§143): database ✓, Cloudinary ✓, CRUD ✓, security ✓,
UX ✓, accessibility ✓ (static), responsive/theme ✓ (static), reliability ✓,
testing ✓ (automated; browser QA deferred), documentation ✓.

```text
PHASE D COMPLETE
```
