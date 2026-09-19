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
- Returns restock: inspection with `RESTOCK` disposition increments `onHand` once (`restockApplied` guard) + `RETURN` movement.

## Reservations

`InventoryReservation` states: `ACTIVE`, `CONVERTED`, `RELEASED`, `EXPIRED`. Checkout converts reservations on payment; release/expiry transition code was not found in inspected files — UNKNOWN.

## Language Rule

Cart quantity is **intent**, not reservation. Only checkout reserves; only payment (or admin inspection) converts. Never describe cart contents as reserved stock.
