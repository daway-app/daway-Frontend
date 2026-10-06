import { describe, expect, it } from 'vitest';
import { buildSalePayload, type CartLine } from './salePayload';

/**
 * Regression guards for the sale payload.
 *
 * 🔴 The first block is the important one. It pins the **double-discount** fix:
 * the POS used to send each line's `line_discount` AND the sum of those same
 * discounts as `discount`. The backend applies both, so the invoice total came
 * out lower than the amount the cashier collected.
 *
 * Measured on the real backend (transaction + rollback, no data written):
 *   item 100, line_discount 10, discount 10 → total=80  paid=80   ✗
 *   item 100, line_discount 10, discount 0  → total=90  paid=90   ✓
 *
 * The Blade POS has the same bug (`accounting-pos.js`), so this test also
 * documents a deliberate divergence from the Blade reference.
 */

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    pharmacyMedicineId: 1,
    medicineId: 10,
    name: 'Panadol',
    barcode: '123',
    quantity: 1,
    unit_price: 100,
    discount: 0,
    ...over,
  };
}

describe('buildSalePayload — double-discount guard', () => {
  it('sends discount: 0 even when lines carry discounts', () => {
    const payload = buildSalePayload({
      cart: [line({ discount: 10 })],
      paid: 90,
      method: 'cash',
    });

    // The whole discount travels on the line, never twice.
    expect(payload.discount).toBe(0);
    expect(payload.items[0].line_discount).toBe(10);
  });

  it('sends discount: 0 with multiple discounted lines', () => {
    const payload = buildSalePayload({
      cart: [line({ discount: 5 }), line({ pharmacyMedicineId: 2, discount: 7.5 })],
      paid: 187.5,
      method: 'cash',
    });

    // The buggy version would have sent 12.5 here and halved the discount again.
    expect(payload.discount).toBe(0);
    expect(payload.items.map((i) => i.line_discount)).toEqual([5, 7.5]);
  });

  it('keeps paid as the amount the cashier collected', () => {
    // Guards the second half of the defect: `paid` was silently capped down to
    // the (wrong) total, losing the difference.
    const payload = buildSalePayload({
      cart: [line({ discount: 10 })],
      paid: 90,
      method: 'cash',
    });
    expect(payload.paid).toBe(90);
  });
});

describe('buildSalePayload — contract shape', () => {
  it('maps cart fields onto the backend key names', () => {
    const payload = buildSalePayload({ cart: [line()], paid: 100, method: 'card' });
    const item = payload.items[0];

    expect(item).toEqual({
      pharmacy_medicine_id: 1,
      medicine_id: 10,
      medicine_name: 'Panadol',
      barcode: '123',
      unit_price: 100,
      quantity: 1,
      line_discount: 0,
    });
    expect(payload.payment_method).toBe('card');
  });

  it('omits optional ids rather than sending null', () => {
    const payload = buildSalePayload({
      cart: [line({ medicineId: null, barcode: '' })],
      paid: 100,
      method: 'cash',
    });

    expect(payload.items[0]).not.toHaveProperty('medicine_id');
    expect(payload.items[0]).not.toHaveProperty('barcode');
  });

  it('omits customer_id for a walk-in sale', () => {
    const payload = buildSalePayload({ cart: [line()], paid: 100, method: 'cash' });
    expect(payload).not.toHaveProperty('customer_id');
  });

  it('includes customer_id when a real customer was picked', () => {
    const payload = buildSalePayload({
      cart: [line()],
      paid: 100,
      method: 'cash',
      customerId: 7,
    });
    expect(payload.customer_id).toBe(7);
  });

  it('produces one item per cart line, preserving order', () => {
    const payload = buildSalePayload({
      cart: [line({ name: 'A' }), line({ name: 'B' }), line({ name: 'C' })],
      paid: 300,
      method: 'cash',
    });
    expect(payload.items.map((i) => i.medicine_name)).toEqual(['A', 'B', 'C']);
  });
});
