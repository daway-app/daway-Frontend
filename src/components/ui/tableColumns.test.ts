import { describe, expect, it } from 'vitest';
import { normaliseColumns } from './tableColumns';

/**
 * Guards for the `DataTable` header derivation.
 *
 * Each assertion below maps to a way a bad `columns` prop rendered a header
 * that lied about the table. All of these typecheck — `ReactNode` accepts
 * them — so nothing but these tests stops the regression coming back.
 */

describe('normaliseColumns()', () => {
  it('keeps a normal list of columns untouched (order preserved)', () => {
    const cols = ['الاسم', 'البريد', 'الهاتف'];
    expect(normaliseColumns(cols)).toEqual(cols);
  });

  it('returns [] for an empty array so no empty <thead> is painted', () => {
    // `<thead><tr></tr></thead>` still draws the header border and background,
    // making the table look like it failed to load rather than having no header.
    expect(normaliseColumns([])).toEqual([]);
  });

  it('splits nothing when handed a bare string (the character-iteration bug)', () => {
    // The caller's bug, not ours: React would have rendered one <th> per
    // letter. We cannot recover the intent, but we must not fabricate six
    // columns from a single word — a string is "not a column list".
    expect(normaliseColumns('الدواء' as unknown)).toEqual([]);
  });

  it('drops null/undefined/false/empty-string entries', () => {
    // The conditional-column idiom: `cond ? def : null`.
    const cols = ['a', null, 'b', undefined, 'c', false, '', 'd'];
    expect(normaliseColumns(cols)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps 0, which is falsy but is still a real header value', () => {
    expect(normaliseColumns([0, 'x'])).toEqual([0, 'x']);
  });

  it('treats a non-array (including a ReactNode object) as no columns', () => {
    expect(normaliseColumns(null)).toEqual([]);
    expect(normaliseColumns(undefined)).toEqual([]);
    expect(normaliseColumns(42)).toEqual([]);
    expect(normaliseColumns({ label: 'x' })).toEqual([]);
  });
});
