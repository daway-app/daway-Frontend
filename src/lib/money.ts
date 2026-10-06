/**
 * Money arithmetic — ONE rounding rule for the whole app.
 *
 * AUDIT B-12 FIX. `Math.round(x * 100) / 100` was re-implemented independently in
 * four accounting files (SaleCreate, Sales, RefundCreate). Any one of them
 * drifting produces two screens showing different totals for the same figure —
 * the exact defect class the app goes out of its way to avoid elsewhere.
 *
 * Every money computation must route through these helpers. Guarded by
 * `money.test.ts`.
 */

/**
 * Round to 2 decimal places using the "half away from zero" behaviour that
 * `Math.round` provides for positive numbers and that the previous inline
 * expressions relied on.
 *
 * Note on negatives: `Math.round(-2.345 * 100) / 100` → `-2.34` (JS rounds
 * halves toward +∞). That matches the prior inline behaviour exactly, so
 * switching to this helper is behaviour-preserving for existing data.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Sum `pick(row)` over `rows`, rounded once at the end (never per-addend). */
export function sumBy<T>(rows: readonly T[], pick: (row: T) => number): number {
  return round2(rows.reduce((acc, row) => acc + pick(row), 0));
}
