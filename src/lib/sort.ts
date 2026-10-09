/**
 * Client-side table sorting.
 *
 * WHY NOT JUST `Array.prototype.sort` AT EACH CALL SITE
 * -----------------------------------------------------
 * Sorting rows looks like a one-liner and is not. Every real table hits at
 * least one of these, and getting one wrong produces a bug nobody reports
 * because it looks like data rather than code:
 *
 *   · **Numbers sort as strings.** `[10, 9, 100].sort()` is `[10, 100, 9]`.
 *     Quantities and prices are numbers and must compare as numbers.
 *   · **`null`/`undefined`/empty poison the comparator.** `'a' < null` is
 *     `false` and `'a' > null` is also `false`, so a comparator written as
 *     `a < b ? -1 : a > b ? 1 : 0` returns 0 for every pair involving a null —
 *     which silently leaves the array in whatever order it arrived in.
 *   · **Arabic text.** `localeCompare` without a locale sorts Arabic by code
 *     point, so `أ` and `ا` land in different places and searching the list
 *     feels broken. `Intl.Collator('ar')` fixes it and is also much faster than
 *     `localeCompare` when reused.
 *   · **Sorting must be stable and must not mutate the source.** React state
 *     arrays must never be sorted in place.
 *
 * So this is a small, tested module rather than four lines repeated nine times.
 */
import { useCallback, useMemo, useState } from 'react';

/** A comparable cell: whatever the column extracts from a row. */
export type SortValue = string | number | boolean | null | undefined;

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}

/**
 * One shared collator.
 *
 * Reusing it matters: constructing an `Intl.Collator` is expensive, and a
 * comparator runs O(n log n) times. It is also `numeric: true`, so `Dose 2`
 * sorts before `Dose 10` — which is what a person expects and what plain string
 * comparison gets wrong.
 */
const collator = new Intl.Collator('ar', {
  numeric: true,
  sensitivity: 'base',
});

/** True for values that carry no information and must sort last, always. */
function isBlank(v: SortValue): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Compare two cells, with blanks always last.
 *
 * Blank ordering is applied AFTER the direction flip, never before. This is the
 * subtle part: a naive comparator returns `+1` for a blank, and `sortRows`
 * multiplies every result by -1 for descending — so the blank would jump to the
 * TOP exactly when the user asked for the highest values, which is the one thing
 * they did not want. "No data" is never the answer to "what is the highest", so
 * the blank case is handled outside the flip.
 *
 * Returns `{ result, blank }` so the caller can decide whether to negate.
 */
function compareCells(a: SortValue, b: SortValue): { result: number; blank: boolean } {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  if (aBlank && bBlank) return { result: 0, blank: true };
  if (aBlank) return { result: 1, blank: true };
  if (bBlank) return { result: -1, blank: true };

  if (typeof a === 'number' && typeof b === 'number') {
    return { result: a - b, blank: false };
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return { result: Number(a) - Number(b), blank: false };
  }
  // Mixed types (a number vs a string, say) fall back to text, which keeps the
  // comparator total rather than producing `NaN` compares.
  return { result: collator.compare(String(a), String(b)), blank: false };
}

/**
 * Compare two cells. Public form: blank-last, ignoring direction.
 *
 * Callers that need direction-aware behaviour should use `sortRows`, which
 * handles the flip correctly.
 */
export function compareValues(a: SortValue, b: SortValue): number {
  return compareCells(a, b).result;
}

/**
 * Sort a copy of `rows`.
 *
 * Returns a NEW array. `rows` is React state at every call site, and sorting in
 * place would mutate it — which works until it does not (a `useMemo` that
 * does not re-run, a stale closure, a double render in StrictMode).
 *
 * With no active sort key the original order is preserved, which for these
 * screens is the server's order (usually the thing the user just changed).
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  get: (row: T, key: K) => SortValue,
): T[] {
  if (!state.key) return rows.slice();
  const key = state.key;
  const factor = state.direction === 'desc' ? -1 : 1;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const { result, blank } = compareCells(get(a.row, key), get(b.row, key));
      // Blanks are never negated — see `compareCells`. Everything else is.
      const directed = blank ? result : result * factor;
      // Tie-break on the original position so equal rows do not shuffle
      // between renders. Without this, re-sorting an equal set looks like the
      // table is randomly rearranging itself.
      return directed !== 0 ? directed : a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * The next sort state when a header is clicked.
 *
 * The cycle is ascending → descending → UNSORTED, and the third state matters:
 * without it there is no way back to the server's own ordering, which is often
 * the one the user wants (e.g. "most recently changed" in inventory). Two-state
 * toggles force the user to sort by something else to escape.
 *
 * Clicking a DIFFERENT column starts that column ascending — not descending,
 * and not carrying the previous direction over.
 */
export function nextSortState<K extends string>(
  current: SortState<K>,
  clicked: K,
): SortState<K> {
  if (current.key !== clicked) return { key: clicked, direction: 'asc' };
  if (current.direction === 'asc') return { key: clicked, direction: 'desc' };
  return { key: null, direction: 'asc' };
}

/**
 * `aria-sort` for a column header.
 *
 * `aria-sort` belongs on the `<th>`, and a sortable-but-inactive column should
 * be `"none"` rather than absent — otherwise a screen reader cannot tell a
 * sortable column from a plain one, and the user never discovers sorting exists.
 */
export function ariaSort<K extends string>(
  state: SortState<K>,
  key: K,
): 'ascending' | 'descending' | 'none' {
  if (state.key !== key) return 'none';
  return state.direction === 'asc' ? 'ascending' : 'descending';
}

/**
 * Sorting state for a table, plus the sorted rows.
 *
 * Returns `sorted` rather than making the caller call `sortRows` themselves so
 * the comparator lives next to the state — a table that has a sort key but
 * forgets to sort is a bug that looks like broken data.
 *
 * `setSort` is the click handler: it advances the cycle for the clicked key.
 */
export function useSort<T, K extends string>(
  rows: readonly T[],
  get: (row: T, key: K) => SortValue,
  initial: SortState<K> = { key: null, direction: 'asc' },
): {
  sort: SortState<K>;
  sorted: T[];
  /** Advance the cycle for `key` — wire this to the header's onClick. */
  toggle: (key: K) => void;
  /** Escape hatch, e.g. to reset when the user clears a filter. */
  set: (next: SortState<K>) => void;
} {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => sortRows(rows, sort, get), [rows, sort, get]);
  const toggle = useCallback((key: K) => setSort((cur) => nextSortState(cur, key)), []);
  return { sort, sorted, toggle, set: setSort };
}
