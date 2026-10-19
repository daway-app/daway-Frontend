import type { ApiAccountingBarcodeResult } from '@/api/pharmacyTypes';

/**
 * Maps a pharmacy-scoped barcode resolve onto the POS scan decisions.
 *
 * Kept pure (no React, no fetch) so it is unit-testable — the same rule as
 * `salePayload.ts`. `AccountingSaleCreatePage.submitBarcode` consumes the
 * outcome; the phone-scanner path goes through the exact same mapper.
 *
 * Server statuses (five business results, all HTTP 200) — the POS must never
 * guess between them, and least of all between `ambiguous` candidates.
 *
 * - `found`        → sellable item (server price + stock quantity)
 * - `out_of_stock` → the item is known AND stocked, but quantity is 0 or the
 *                    row is unavailable; returned WITH the item (quantity 0)
 *                    so the cashier sees it and the add-to-cart stock guard
 *                    rejects the addition.
 * - `not_in_stock` → medicine exists in the catalog but THIS pharmacy does
 *                    not stock it. Returns only the display name — no ids,
 *                    no price, no way to attach a stock row by accident.
 * - `unknown`      → barcode not registered in the catalog at all.
 * - `ambiguous`    → multiple inventory rows match; the response carries
 *                    `candidates[]` and the POS refuses to pick one itself.
 */
export type BarcodeScanOutcome =
  | { kind: 'found'; item: BarcodeScanItem }
  | { kind: 'out_of_stock'; item: BarcodeScanItem }
  | { kind: 'not_in_stock'; name: string | null }
  | { kind: 'unknown' }
  | { kind: 'ambiguous'; candidates: number };

/**
 * A sellable scan hit — same fields the POS `CatalogItem` needs for its cart
 * merge (`pharmacyMedicineId` is what `POST /sales` decrements stock against).
 */
export interface BarcodeScanItem {
  pharmacyMedicineId: number;
  medicineId: number | null;
  name: string;
  ingredient: string;
  barcode: string;
  quantity: number;
  price: number;
}

export function mapAccountingBarcodeResult(
  data: ApiAccountingBarcodeResult,
): BarcodeScanOutcome {
  if (data.status === 'unknown') {
    return { kind: 'unknown' };
  }

  if (data.status === 'ambiguous') {
    return { kind: 'ambiguous', candidates: data.candidates.length };
  }

  if (data.status === 'not_in_stock') {
    return {
      kind: 'not_in_stock',
      name: data.medicine?.trade_name ?? data.medicine?.trade_name_ar ?? null,
    };
  }

  // found | out_of_stock — both carry the pharmacy's own stock row.
  // Server truth wins over anything cached: price and quantity come from
  // `pharmacy_medicines`, not from a previous render or a stale draft.
  if (data.pharmacy_medicine_id === null) {
    // Defensive: a `found`/`out_of_stock` resolve always has a stock row id.
    // A payload without one MUST NOT become a sellable cart line.
    return {
      kind: 'not_in_stock',
      name: data.medicine?.trade_name ?? data.medicine?.trade_name_ar ?? null,
    };
  }

  const item: BarcodeScanItem = {
    pharmacyMedicineId: data.pharmacy_medicine_id,
    medicineId: data.local_medicine_id,
    name:
      data.medicine?.trade_name ??
      data.medicine?.trade_name_ar ??
      '(بدون اسم)',
    ingredient: data.medicine?.active_ingredient ?? '',
    barcode: data.barcode,
    quantity:
      data.quantity !== null && Number.isFinite(data.quantity)
        ? Math.max(0, Math.trunc(data.quantity))
        : 0,
    price: data.price !== null && Number.isFinite(data.price) ? data.price : 0,
  };

  // `out_of_stock` and a `found` row degraded to no/zero stock both land in
  // the same visible state: show the item, quantity 0 — the cart guard then
  // blocks the addition. Nothing here invents a positive quantity.
  return {
    kind: data.status === 'out_of_stock' || item.quantity <= 0
      ? 'out_of_stock'
      : 'found',
    item,
  };
}
