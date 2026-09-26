import { describe, expect, it } from 'vitest';

import { buildCheckoutInput, type CheckoutFormState } from './shopping-api';

const form = (overrides: Partial<CheckoutFormState> = {}): CheckoutFormState => ({
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '0712345678',
  deliveryMethodId: '11111111-1111-4111-8111-111111111111',
  shippingZoneCode: 'NRB',
  addressId: '',
  line1: '123 Market Street',
  city: 'Nairobi',
  state: '',
  postalCode: '',
  country: 'KE',
  notes: '',
  ...overrides,
});

describe('buildCheckoutInput delivery-zone contract', () => {
  it('includes a valid zone selection and address for delivery methods', () => {
    const input = buildCheckoutInput(form(), { needsAddress: true, confirmPriceChanges: false });
    expect(input.shippingZoneCode).toBe('NRB');
    expect(input.address).toMatchObject({ line1: '123 Market Street', city: 'Nairobi', country: 'KE' });
  });

  it('omits blank zone codes instead of sending an empty string', () => {
    const input = buildCheckoutInput(form({ shippingZoneCode: '' }), {
      needsAddress: true,
      confirmPriceChanges: false,
    });
    expect('shippingZoneCode' in input && input.shippingZoneCode).toBeFalsy();
    expect(input.shippingZoneCode).toBeUndefined();
  });

  it('omits the address for pickup and blank saved-address/note selections', () => {
    const input = buildCheckoutInput(form({ addressId: '', notes: '' }), {
      needsAddress: false,
      confirmPriceChanges: false,
    });
    expect(input.address).toBeUndefined();
    expect(input.addressId).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it('forwards a saved address selection and price confirmation', () => {
    const input = buildCheckoutInput(
      form({ addressId: '22222222-2222-4222-8222-222222222222', notes: 'Leave at gate' }),
      { needsAddress: true, confirmPriceChanges: true },
    );
    expect(input.addressId).toBe('22222222-2222-4222-8222-222222222222');
    expect(input.notes).toBe('Leave at gate');
    expect(input.confirmPriceChanges).toBe(true);
  });
});
