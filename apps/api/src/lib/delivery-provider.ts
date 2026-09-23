export type ShipmentRequest = {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  address: unknown;
  trackingReference: string;
};

export type ShipmentResult = {
  provider: string;
  providerShipmentId: string;
  trackingNumber: string;
  rawResponse?: unknown;
};

export interface DeliveryProvider {
  createShipment(input: ShipmentRequest): Promise<ShipmentResult>;
  getShipmentStatus(providerShipmentId: string): Promise<{ status: string; rawResponse?: unknown }>;
  cancelShipment?(providerShipmentId: string): Promise<void>;
}

export class NoopCourierProvider implements DeliveryProvider {
  async createShipment(input: ShipmentRequest): Promise<ShipmentResult> {
    return {
      provider: 'INTERNAL_PENDING_PROVIDER',
      providerShipmentId: input.trackingReference,
      trackingNumber: input.trackingReference,
    };
  }

  async getShipmentStatus() {
    return { status: 'UNKNOWN' };
  }
}
