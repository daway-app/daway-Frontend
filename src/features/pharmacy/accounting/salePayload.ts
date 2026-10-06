/**
 * Sale payload builder for the POS — extracted so it can be TESTED.
 *
 * It was inline inside `AccountingSaleCreatePage.completeSale()`, which is why
 * the double-discount defect could ship: nothing could assert on the payload
 * without driving the whole component.
 *
 * ── The defect this guards against ──────────────────────────────────────────
 *
 * `AccountingLedger::recordSale()` applies a per-line discount and then an
 * ADDITIONAL invoice-level discount:
 *
 *     $lineTotal = ($unitPrice × $quantity) − $lineDiscount
 *     $subtotal  = Σ $lineTotal
 *     $total     = $subtotal − $discount
 *
 * Every discount in this till is per-line, so sending the sum of the line
 * discounts as `discount` too applies it TWICE. Measured on the real backend
 * (transaction + rollback, no data written):
 *
 *     item 100, line_discount 10, discount 10
 *       → subtotal=90  discount=10  total=80  paid=80   ✗ cashier collected 90
 *     item 100, line_discount 10, discount 0
 *       → subtotal=90  discount=0   total=90  paid=90   ✓
 *
 * The Blade POS (`resources/js/accounting/accounting-pos.js`) has the same bug —
 * it sends `line_discount` per item AND `discount: t.discount`. Per the project
 * rule, a Blade defect is not copied into React; it is fixed and documented.
 *
 * `discount` is therefore always 0. If an invoice-level discount is ever added
 * to the UI, it must be tracked SEPARATELY from the per-line discounts.
 */
import type { ApiSalePayload } from '@/api/pharmacyTypes';

export interface CartLine {
  pharmacyMedicineId: number;
  medicineId: number | null;
  name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  discount: number;
}

export interface SalePayloadInput {
  cart: readonly CartLine[];
  paid: number;
  method: string;
  /** Only sent when a real customer was picked — the walk-in has no id. */
  customerId?: number | null;
}

/** The wire shape lives with the other API contracts. */
export type SalePayload = ApiSalePayload;

export function buildSalePayload({
  cart,
  paid,
  method,
  customerId,
}: SalePayloadInput): SalePayload {
  return {
    ...(customerId ? { customer_id: customerId } : {}),
    items: cart.map((l) => ({
      pharmacy_medicine_id: l.pharmacyMedicineId,
      // The two optional ids are omitted rather than sent as null — the backend
      // rules are `nullable|integer` and accept absence.
      ...(l.medicineId ? { medicine_id: l.medicineId } : {}),
      medicine_name: l.name,
      ...(l.barcode ? { barcode: l.barcode } : {}),
      unit_price: l.unit_price,
      quantity: l.quantity,
      line_discount: l.discount,
    })),
    // ALWAYS 0 — see the header. The line discounts carry the whole discount.
    discount: 0,
    paid,
    payment_method: method,
  };
}
