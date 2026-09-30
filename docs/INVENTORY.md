# Inventory

Per-variant stock ledger. Source: `apps/api/src/lib/catalog.ts`, `lib/admin.ts`, `routes/catalogue.ts`.

## Stock Model

```text
available = max(quantityOnHand − quantityReserved, 0)
```

- `Inventory` (one row per variant): `quantityOnHand`, `quantityReserved`, low-stock threshold (default 5 on variant creation).
- Every change appends an `InventoryMovement` (`IN`, `OUT`, `ADJUSTMENT`, `RESERVED`, `RELEASED`, `RETURN`).
- Checkout reserves atomically (conditional reservation inside a transaction); oversell is guarded at the database level, not by UI checks.

## Operations

- Variant creation auto-creates zeroed inventory in the same transaction.
- Restock: `POST /admin/inventory/:variantId/restock {quantity 1–100000, lowStockThreshold?, reason}` → `onHand += qty` + `IN` movement.
- Adjust: `POST /admin/inventory/:variantId/adjust {delta, reason}` — non-zero integer, `|delta| ≤ 100000`, resulting stock must be ≥ 0 and ≥ reserved, else `409 RESERVED_STOCK_CONFLICT`.
- Both write append-only `AuditLog(INVENTORY_ADJUSTED)` with actor, IP, user-agent; reason 3–200 chars.
- Returns restock: inspection with `RESTOCK` disposition increments `onHand` via an atomic `updateMany` claim on `restockApplied=false` (concurrent inspects collapse to one winner with `409 RETURN_RESTOCK_CONFLICT`) + `RETURN` movement.
- Cancellation: `POST /admin/orders/:orderNumber/cancel {reason}` (unpaid, unfulfilled orders only) releases every `ACTIVE` reservation (`reserved -= qty`, `RELEASED` movement with `ORDER` reference, `ORDER_CANCELLED` audit). Re-cancelling is a no-op success — stock is never released twice. Paid orders are refused (`ORDER_PAID_USE_RETURNS`) so financial reversal stays coupled to the returns/refund flow.
- Barcode-keyed access: `GET /admin/inventory/lookup?barcode=` resolves the exact variant (SKU, attributes, stock); inventory search also matches barcodes. Scanning never mutates stock — adjustments route through the existing restock/adjust endpoints. See [CATALOGUE.md](CATALOGUE.md#barcode--product-identification-phase-5).

## Reservations

`InventoryReservation` states: `ACTIVE`, `CONVERTED`, `RELEASED`, `EXPIRED`. Checkout creates `ACTIVE`; payment success converts (`OUT` movement); cancellation, failure-idle expiry and the stale sweep release (`RELEASED` movement). Payment conversion is guarded per row: a mismatched reservation stays `ACTIVE` and the callback returns `reconciliationRequired` instead of rolling back a confirmed payment (money truth wins; fulfillment eligibility blocks until staff reconcile).

## Language Rule

Cart quantity is **intent**, not reservation. Only checkout reserves; only payment (or admin inspection) converts. Never describe cart contents as reserved stock.
