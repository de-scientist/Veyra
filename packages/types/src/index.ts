export type UserRoleName = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

export type PaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export type FulfillmentStatus = 'UNFULFILLED' | 'PROCESSING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED';
export type InventoryMovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'RESERVED' | 'RELEASED' | 'RETURN';
export type PaymentProvider = 'MPESA' | 'CARD' | 'PAYPAL' | 'OTHER';
export type ShippingMethodType = 'PICKUP' | 'LOCAL_DELIVERY' | 'COURIER';
