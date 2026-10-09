import { describe, expect, it } from 'vitest';
import {
  ariaSort,
  compareValues,
  nextSortState,
  sortRows,
  type SortState,
} from './sort';

/**
 * Guards for table sorting.
 *
 * Every assertion here corresponds to a way sorting silently produces wrong-
 * looking data. None of them would be caught by eyeballing a table: the rows
 * would just be in an order that seems plausible.
 */

type Row = { name: string; qty: number | null; price: number | null; tag: string | null };
const rows: Row[] = [
  { name: 'ب', qty: 10, price: 5.5, tag: 'x' },
  { name: 'أ', qty: 9, price: 12, tag: null },
  { name: 'ج', qty: 100, price: null, tag: 'y' },
  { name: 'د', qty: null, price: 1, tag: '' },
];

const get = (r: Row, k: 'name' | 'qty' | 'price' | 'tag') => r[k];

describe('compareValues()', () => {
  it('sorts numbers numerically, not as strings', () => {
    // The classic: `[10, 9, 100].sort()` gives [10, 100, 9]. If this regressed,
    // the quantity column would order 100 between 9 and 10.
    const qty = rows.map((r) => r.qty);
    const sorted = [...qty].sort((a, b) => compareValues(a, b));
    expect(sorted).toEqual([9, 10, 100, null]);
  });

  it('sorts Arabic with a locale collator, so letter shapes group correctly', () => {
    const names = ['ب', 'أ', 'ج'];
    expect([...names].sort((a, b) => compareValues(a, b))).toEqual(['أ', 'ب', 'ج']);
  });

  it('sorts a numeric string naturally, so "Dose 2" precedes "Dose 10"', () => {
    const v = ['Dose 10', 'Dose 2'];
    expect([...v].sort((a, b) => compareValues(a, b))).toEqual(['Dose 2', 'Dose 10']);
  });

  it('puts null and undefined LAST when ascending', () => {
    expect(compareValues(null, 5)).toBe(1);
    expect(compareValues(undefined, 5)).toBe(1);
  });

  it('also puts blanks last when descending — not first', () => {
    // This is the important one, and it caught a real bug: the first
    // implementation negated the whole comparator result for descending, which
    // flipped blank-handling to the TOP. The user asked for the highest values
    // and was shown the empty rows. Blank ordering must be applied after the
    // direction flip.
    const asc = sortRows(rows, { key: 'qty', direction: 'asc' }, get).map((r) => r.qty);
    const desc = sortRows(rows, { key: 'qty', direction: 'desc' }, get).map((r) => r.qty);
    expect(asc[asc.length - 1]).toBeNull();
    expect(desc[desc.length - 1]).toBeNull();
    expect(desc[0]).toBe(100);
  });

  it('treats a whitespace-only string as blank', () => {
    expect(compareValues('   ', 1)).toBe(1);
  });

  it('is a total function for mixed types (never returns NaN)', () => {
    // A comparator returning NaN makes the sort order engine-defined, which
    // means the table can reorder itself between renders for no reason.
    const mixed: Array<string | number | null> = ['b', 2, null, 'a', 1];
    const out = mixed.slice().sort((a, b) => compareValues(a, b));
    expect(out.filter((v) => v === null)).toEqual([null]);
    expect(out.filter((v) => typeof v === 'number')).toEqual([1, 2]);
  });

  it('handles booleans', () => {
    expect(compareValues(false, true)).toBeLessThan(0);
  });

  it('returns 0 for two blanks', () => {
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues('', undefined)).toBe(0);
  });
});

describe('sortRows()', () => {
  it('does not mutate the input array', () => {
    // These are React state arrays; sorting in place works until a memo
    // stops re-running and the table freezes in a stale order.
    const original = [...rows];
    sortRows(rows, { key: 'qty', direction: 'asc' }, get);
    expect(rows).toEqual(original);
  });

  it('preserves the original order when no key is active', () => {
    expect(sortRows(rows, { key: null, direction: 'asc' }, get)).toEqual(rows);
  });

  it('sorts descending when asked', () => {
    const out = sortRows(rows, { key: 'qty', direction: 'desc' }, get).map((r) => r.qty);
    expect(out.slice(0, 3)).toEqual([100, 10, 9]);
  });

  it('is stable: equal rows keep their relative order', () => {
    // Without the index tie-break, equal values can swap between renders and
    // the table looks like it is shuffling itself.
    const dupes: Row[] = [
      { name: 'first', qty: 5, price: 1, tag: 'a' },
      { name: 'second', qty: 5, price: 1, tag: 'a' },
      { name: 'third', qty: 5, price: 1, tag: 'a' },
    ];
    const out = sortRows(dupes, { key: 'qty', direction: 'asc' }, get).map((r) => r.name);
    expect(out).toEqual(['first', 'second', 'third']);
  });

  it('returns a new array even when there is nothing to sort', () => {
    const out = sortRows(rows, { key: null, direction: 'asc' }, get);
    expect(out).not.toBe(rows);
  });

  it('handles an empty list', () => {
    expect(sortRows([], { key: 'qty', direction: 'asc' }, get)).toEqual([]);
  });
});

describe('nextSortState()', () => {
  it('starts a new column ascending', () => {
    const state: SortState<'qty'> = { key: 'name' as 'qty', direction: 'desc' };
    expect(nextSortState(state, 'qty')).toEqual({ key: 'qty', direction: 'asc' });
  });

  it('cycles asc -> desc -> none', () => {
    const asc: SortState<'qty'> = { key: 'qty', direction: 'asc' };
    const desc = nextSortState(asc, 'qty');
    expect(desc).toEqual({ key: 'qty', direction: 'desc' });

    // The third state is the point: without it there is no way back to the
    // server's own ordering (often "most recently changed").
    const none = nextSortState(desc, 'qty');
    expect(none).toEqual({ key: null, direction: 'asc' });
  });

  it('restarts ascending after the cycle completes', () => {
    const none: SortState<'qty'> = { key: null, direction: 'asc' };
    expect(nextSortState(none, 'qty')).toEqual({ key: 'qty', direction: 'asc' });
  });
});

describe('ariaSort()', () => {
  it('is "none" for every inactive column, including sortable ones', () => {
    // Setting it to "none" rather than omitting it is what tells a screen
    // reader the column IS sortable but not currently sorted.
    expect(ariaSort({ key: 'qty', direction: 'asc' } as SortState<'qty' | 'name'>, 'name')).toBe(
      'none',
    );
  });

  it('reports the active direction', () => {
    expect(ariaSort({ key: 'qty', direction: 'asc' }, 'qty')).toBe('ascending');
    expect(ariaSort({ key: 'qty', direction: 'desc' }, 'qty')).toBe('descending');
  });
});
