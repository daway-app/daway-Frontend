import { describe, expect, it } from 'vitest';
import type { ApiAccountingBarcodeResult } from '@/api/pharmacyTypes';
import { mapAccountingBarcodeResult } from './barcodeResult';

/** A `found` payload the backend actually produces (AccountingBarcodeController). */
function result(overrides: Partial<ApiAccountingBarcodeResult> = {}): ApiAccountingBarcodeResult {
  return {
    status: 'found',
    barcode: '6291041500213',
    medicine: {
      id: 9,
      trade_name: 'بنادول',
      trade_name_ar: 'بانادول',
      active_ingredient: 'Paracetamol',
      manufacturer: 'TestPharma',
      dosage_form: 'Tablet',
      packaging: '20 tablets',
      official_price: 15,
      image_url: null,
    },
    pharmacy_medicine_id: 41,
    local_medicine_id: 9,
    moh_medicine_id: 3,
    price: 12.5,
    quantity: 7,
    is_available: true,
    is_out_of_stock: false,
    is_low_stock: false,
    candidates: [],
    ...overrides,
  };
}

describe('mapAccountingBarcodeResult', () => {
  it('maps `found` to a sellable item with SERVER price and stock', () => {
    const outcome = mapAccountingBarcodeResult(result());

    expect(outcome.kind).toBe('found');
    if (outcome.kind !== 'found') {
      throw new Error('expected a found outcome');
    }
    expect(outcome.item.pharmacyMedicineId).toBe(41);
    expect(outcome.item.medicineId).toBe(9);
    expect(outcome.item.name).toBe('بنادول');
    expect(outcome.item.ingredient).toBe('Paracetamol');
    expect(outcome.item.price).toBe(12.5);
    expect(outcome.item.quantity).toBe(7);
    expect(outcome.item.barcode).toBe('6291041500213');
  });

  it('maps `not_in_stock` to display-only info — no ids, no price', () => {
    const outcome = mapAccountingBarcodeResult(
      result({
        status: 'not_in_stock',
        pharmacy_medicine_id: null,
        local_medicine_id: 9,
        price: null,
        quantity: null,
        is_available: null,
        is_out_of_stock: true,
      }),
    );

    // Another pharmacy's row must never leak through as a sellable item.
    expect(outcome).toEqual({ kind: 'not_in_stock', name: 'بنادول' });
  });

  it('maps `unknown` to no item at all', () => {
    const outcome = mapAccountingBarcodeResult(
      result({
        status: 'unknown',
        medicine: null,
        pharmacy_medicine_id: null,
        local_medicine_id: null,
        moh_medicine_id: null,
        price: null,
        quantity: null,
        is_available: null,
        is_out_of_stock: true,
      }),
    );

    expect(outcome).toEqual({ kind: 'unknown' });
  });

  it('maps `ambiguous` to a candidates count and never picks a row', () => {
    const outcome = mapAccountingBarcodeResult(
      result({
        status: 'ambiguous',
        pharmacy_medicine_id: null,
        price: null,
        quantity: null,
        is_available: null,
        is_out_of_stock: true,
        candidates: [
          {
            pharmacy_medicine_id: 41,
            medicine_id: 9,
            moh_medicine_id: 3,
            name: 'بنادول',
            price: 12.5,
            quantity: 7,
            is_available: true,
          },
          {
            pharmacy_medicine_id: 42,
            medicine_id: 10,
            moh_medicine_id: 3,
            name: 'بانادول إكسترا',
            price: 14.0,
            quantity: 3,
            is_available: true,
          },
        ],
      }),
    );

    // No `item` field in the outcome — the POS cannot silently sell `candidates[0]`.
    expect(outcome).toEqual({ kind: 'ambiguous', candidates: 2 });
  });

  it('maps `out_of_stock` to a visible item with quantity 0 (add is blocked)', () => {
    const outcome = mapAccountingBarcodeResult(
      result({ status: 'out_of_stock', quantity: 0, is_available: false, is_out_of_stock: true }),
    );

    expect(outcome.kind).toBe('out_of_stock');
    if (outcome.kind === 'out_of_stock') {
      expect(outcome.item.pharmacyMedicineId).toBe(41);
      expect(outcome.item.quantity).toBe(0);
      expect(outcome.item.price).toBe(12.5); // price is still the real stock row's price
    }
  });

  it('defends against a stock-less found payload — not sellable', () => {
    const outcome = mapAccountingBarcodeResult(
      result({ pharmacy_medicine_id: null, is_out_of_stock: true }),
    );

    expect(outcome.kind).toBe('not_in_stock');
  });

  it('clamps a bogus negative quantity to 0 but keeps the row visible', () => {
    const outcome = mapAccountingBarcodeResult(result({ quantity: -5 }));

    expect(outcome.kind).toBe('out_of_stock');
    if (outcome.kind === 'out_of_stock') {
      expect(outcome.item.quantity).toBe(0);
    }
  });
});
