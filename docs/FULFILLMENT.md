# Fulfillment & Delivery

## Methods

`ShippingMethodType`: `PICKUP`, `LOCAL_DELIVERY`, `COURIER`. Pickup and local delivery are fully worked; courier is architecture-ready (type + assignment fields exist; courier integration NOT VERIFIED).

## Model

`ShippingZone` (code + country) → `ShippingMethod` (`ACTIVE` gated) → `ShippingRate` (base price by `minOrderValue` tiers). `Delivery` per order with tracking number (`VYR-YYYYMMDD-<8HEX>`), courier fields (`courierProvider`, `providerShipmentId` — plain strings, no integration), assignee, and `DeliveryStatusHistory`.

## Workflow

`PENDING → PREPARING → PICKED → PACKED → READY_FOR_PICKUP` (pickup) or `ASSIGNED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED / PICKED_UP` (delivery), plus `DELIVERY_ATTEMPTED`, `FAILED`. Each move syncs `Order.fulfillmentStatus` (`UNFULFILLED → PROCESSING → PACKED → SHIPPED → DELIVERED`) and appends history + notification events. Terminal delivery completes the order (`COMPLETED`).

Admin queue (`/admin/fulfillment`): start, pick, pack, assign staff, update delivery status. Customers track at `/account/orders/[orderNumber]/tracking` and get pickup-ready notifications.

## Business Gaps

Shipping rates, zones, coverage, and pickup points are BUSINESS DECISION BLOCKERs for checkout — see [BUSINESS-DECISIONS](../BUSINESS-DECISIONS.md).
