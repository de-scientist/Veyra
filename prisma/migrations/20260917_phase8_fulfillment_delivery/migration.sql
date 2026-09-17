-- Phase 8: fulfillment and delivery lifecycle.

CREATE TYPE "DeliveryStatus" AS ENUM (
  'PENDING',
  'PREPARING',
  'PICKED',
  'PACKED',
  'READY_FOR_PICKUP',
  'ASSIGNED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'DELIVERED',
  'PICKED_UP',
  'FAILED',
  'CANCELLED',
  'RETURNED'
);

ALTER TABLE "Delivery"
ADD COLUMN "shippingZoneId" TEXT,
ADD COLUMN "assignedTo" TEXT,
ADD COLUMN "internalReference" TEXT NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "providerShipmentId" TEXT,
ADD COLUMN "recipientName" TEXT,
ADD COLUMN "recipientPhone" TEXT,
ADD COLUMN "deliveryAddress" JSONB,
ADD COLUMN "deliveryInstructions" TEXT,
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "pickedUpAt" TIMESTAMP(3);

ALTER TABLE "Delivery"
ALTER COLUMN "status" TYPE "DeliveryStatus"
USING CASE "status"::text
  WHEN 'UNFULFILLED' THEN 'PENDING'::"DeliveryStatus"
  WHEN 'PROCESSING' THEN 'PREPARING'::"DeliveryStatus"
  WHEN 'PACKED' THEN 'PACKED'::"DeliveryStatus"
  WHEN 'SHIPPED' THEN 'IN_TRANSIT'::"DeliveryStatus"
  WHEN 'DELIVERED' THEN 'DELIVERED'::"DeliveryStatus"
  WHEN 'RETURNED' THEN 'RETURNED'::"DeliveryStatus"
  ELSE 'PENDING'::"DeliveryStatus"
END;

ALTER TABLE "Delivery"
ALTER COLUMN "internalReference" DROP DEFAULT;

CREATE UNIQUE INDEX "Delivery_internalReference_key" ON "Delivery"("internalReference");
CREATE UNIQUE INDEX "Delivery_trackingNumber_key" ON "Delivery"("trackingNumber");
CREATE INDEX "Delivery_status_createdAt_idx" ON "Delivery"("status", "createdAt");
CREATE INDEX "Delivery_assignedTo_status_idx" ON "Delivery"("assignedTo", "status");
CREATE INDEX "Delivery_providerShipmentId_idx" ON "Delivery"("providerShipmentId");

CREATE TABLE "DeliveryStatusHistory" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "fromStatus" "DeliveryStatus",
  "toStatus" "DeliveryStatus" NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "providerEventReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryStatusHistory_deliveryId_createdAt_idx" ON "DeliveryStatusHistory"("deliveryId", "createdAt");
CREATE INDEX "DeliveryStatusHistory_providerEventReference_idx" ON "DeliveryStatusHistory"("providerEventReference");

ALTER TABLE "Delivery"
ADD CONSTRAINT "Delivery_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Delivery_shippingZoneId_fkey" FOREIGN KEY ("shippingZoneId") REFERENCES "ShippingZone"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "Delivery_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryStatusHistory"
ADD CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "DeliveryStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
