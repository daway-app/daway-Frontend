/**
 * Stock status — the ONE place stock numbers are computed in the live app.
 *
 * 🔴 APPROVED RULE (عبود, 2026-10-04):
 *      out  : quantity <= 0
 *      low  : quantity > 0 AND quantity <= LOW_STOCK_THRESHOLD (10)
 *      ok   : quantity > LOW_STOCK_THRESHOLD
 *
 * ---------------------------------------------------------------------------
 * WHY WE DERIVE CLIENT-SIDE INSTEAD OF TRUSTING THE API AGGREGATE
 * ---------------------------------------------------------------------------
 * The backend's `stats.available_count` (and `dashboard.stats.available_count`)
 * is computed as `is_available = true AND quantity > 0`. Because every low-stock
 * row also satisfies that condition, the low rows are counted TWICE:
 *
 *      live pharmacy PH-1234 → 11 rows
 *        backend says          total 11 · out 0 · low 6 · available 11   ❌
 *        derived from rows     total 11 · out 0 · low 6 · available  5   ✅
 *
 * `6 + 11 = 17 > 11` — the response contradicts itself. The backend's own
 * per-row flags (`is_low_stock` / `is_out_of_stock`) are correct; only the
 * aggregate is wrong. It is the same legacy Blade defect the mock layer already
 * documented and refused to reproduce.
 *
 * So: the aggregate fields are NOT used for display. We derive from the rows,
 * which are authoritative. See `docs/API-CONTRACT-MAP.md` → DEFECT-1.
 */

/** Must match `PharmacyMedicine::LOW_STOCK_THRESHOLD` on the backend. */
export const LOW_STOCK_THRESHOLD = 10;

export type StockStatus = 'ok' | 'low' | 'out';

/** Derive one row's status from its quantity. */
export function stockStatus(
  quantity: number,
  threshold = LOW_STOCK_THRESHOLD,
): StockStatus {
  if (quantity <= 0) return 'out';
  if (quantity <= threshold) return 'low';
  return 'ok';
}

export interface StockCounts {
  total: number;
  out: number;
  low: number;
  available: number;
}

/**
 * Count rows by status.
 *
 * @param items rows carrying at least a `quantity`
 */
export function countStock(
  items: ReadonlyArray<{ quantity: number }>,
  threshold = LOW_STOCK_THRESHOLD,
): StockCounts {
  let out = 0;
  let low = 0;
  let available = 0;

  for (const item of items) {
    const status = stockStatus(item.quantity, threshold);
    if (status === 'out') out += 1;
    else if (status === 'low') low += 1;
    else available += 1;
  }

  return { total: items.length, out, low, available };
}

/** `.ph-badge` variant for a stock row. */
export function stockBadgeVariant(quantity: number): 'ok' | 'low' | 'out' {
  return stockStatus(quantity);
}
