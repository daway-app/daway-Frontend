import { describe, expect, it } from 'vitest';
import {
  isIndeterminate,
  selectedIds,
  selectionState,
  toggleAll,
  toggleOne,
} from './selection';

/**
 * Guards for the bulk-select state derivation.
 *
 * The header checkbox is tri-state and `indeterminate` is a DOM property, not
 * an attribute — so the derivation is the only place the "some" state can
 * regress without anyone noticing. Every assertion below maps to a way a
 * partial selection would render as something else.
 */

const page = [1, 2, 3, 4];

describe('selectionState()', () => {
  it('is "none" when nothing is selected', () => {
    expect(selectionState(new Set(), page)).toBe('none');
  });

  it('is "none" for an empty page, even with stale ids selected', () => {
    // A header reading "all" over an empty list is a lie, and a stale id must
    // not keep a control ticked when its row is gone.
    expect(selectionState(new Set([1, 2]), [])).toBe('none');
  });

  it('is "all" when every row is selected', () => {
    expect(selectionState(new Set([1, 2, 3, 4]), page)).toBe('all');
  });

  it('is "some" for a partial selection — the state that drives indeterminate', () => {
    expect(selectionState(new Set([2]), page)).toBe('some');
    expect(selectionState(new Set([1, 3, 4]), page)).toBe('some');
  });

  it('ignores ids that are not on the page', () => {
    // Intersecting with the visible rows is what stops "3 محدد" being shown
    // while only 2 rows carry a tick.
    expect(selectionState(new Set([1, 99]), page)).toBe('some');
    expect(selectionState(new Set([99, 100]), page)).toBe('none');
  });
});

describe('isIndeterminate()', () => {
  it('is true only for the partial state', () => {
    expect(isIndeterminate('some')).toBe(true);
    expect(isIndeterminate('none')).toBe(false);
    expect(isIndeterminate('all')).toBe(false);
  });
});

describe('toggleAll()', () => {
  it('selects the whole page from "none"', () => {
    expect([...toggleAll(new Set(), page)].sort((a, b) => a - b)).toEqual(page);
  });

  it('fills the page from "some"', () => {
    expect([...toggleAll(new Set([2]), page)].sort((a, b) => a - b)).toEqual(page);
  });

  it('clears the page when everything is selected', () => {
    expect([...toggleAll(new Set([1, 2, 3, 4]), page)]).toEqual([]);
  });

  it('preserves selections made outside the current page', () => {
    // Toggling the header on a filtered view must not discard selections the
    // user made under another filter.
    const next = toggleAll(new Set([1, 77]), [1, 2, 3, 4]);
    expect([...next].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 77]);
  });

  it('returns a new Set and does not mutate the caller state', () => {
    const selected = new Set([1]);
    const next = toggleAll(selected, page);
    expect(next).not.toBe(selected);
    expect([...selected]).toEqual([1]);
  });

  it('is a no-op set for an empty page', () => {
    expect([...toggleAll(new Set([5]), [])]).toEqual([5]);
  });
});

describe('toggleOne()', () => {
  it('adds an unselected row', () => {
    const next = toggleOne(new Set([1]), 2);
    expect([...next].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('removes a selected row', () => {
    expect([...toggleOne(new Set([1, 2]), 1)]).toEqual([2]);
  });

  it('does not mutate the caller state', () => {
    const selected = new Set([1]);
    toggleOne(selected, 2);
    expect([...selected]).toEqual([1]);
  });
});

describe('selectedIds()', () => {
  it('returns selected ids in row order', () => {
    expect(selectedIds(new Set([3, 1]), page)).toEqual([1, 3]);
  });

  it('drops stale ids no longer on the page', () => {
    expect(selectedIds(new Set([2, 99]), page)).toEqual([2]);
  });

  it('returns an empty array for an empty selection', () => {
    expect(selectedIds(new Set(), page)).toEqual([]);
  });
});
