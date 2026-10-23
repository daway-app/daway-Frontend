import { describe, expect, it } from 'vitest';
import type { ApiImportRow } from '@/api/pharmacyTypes';
import {
  blockingCount,
  buildDecisionPayload,
  canCreate,
  canLink,
  createTargetFor,
  defaultDecision,
  groupsWithoutMerge,
  initialDecisions,
  initialTargets,
  linkTargetFor,
  mergeWinnerRow,
  pendingRowNumbers,
  type ImportDecisions,
} from './importReview';

function row(over: Partial<ApiImportRow> = {}): ApiImportRow {
  return {
    row: 1,
    input: {
      trade_name: 'PANADOL',
      trade_name_ar: null,
      active_ingredient: null,
      price: 10,
      quantity: 5,
      barcode: null,
      min_stock: null,
      is_available: true,
    },
    status: 'UNMATCHED',
    match_method: null,
    medicine_id: null,
    proposed_moh_id: null,
    resolved_name: null,
    resolved_name_ar: null,
    official_price: null,
    suggestions: [],
    warnings: [],
    errors: [],
    decision: 'pending',
    duplicate_group: null,
    ...over,
  };
}

describe('import review decisions', () => {
  it('defaults invalid rows to skip and saved decisions win', () => {
    expect(defaultDecision(row({ errors: ['missing_price'] }))).toBe('skip');
    expect(defaultDecision(row({ decision: 'skip', errors: ['missing_price'] }))).toBe('skip');
    expect(defaultDecision(row({ decision: 'create', proposed_moh_id: 9 }))).toBe('create');
  });

  it('defaults to link when a medicine is already resolved', () => {
    expect(defaultDecision(row({ medicine_id: 4 }))).toBe('link');
    expect(canLink(row({ medicine_id: 4 }))).toBe(true);
    expect(linkTargetFor(row({ medicine_id: 4 }))).toEqual({
      medicineId: 4,
      medicineName: '',
    });
  });

  it('defaults to create when the MOH catalog proposed a match', () => {
    expect(defaultDecision(row({ proposed_moh_id: 12 }))).toBe('create');
    expect(createTargetFor(row({ proposed_moh_id: 12 }))).toEqual({
      mohId: 12,
      mohName: '',
    });
  });

  it('uses suggestions as link and create targets', () => {
    const withLink = row({
      suggestions: [
        {
          medicine_id: 7,
          moh_id: null,
          name: 'Panadol',
          name_ar: null,
          active_ingredient: null,
          official_price: null,
          source: 'catalog',
        },
      ],
    });
    expect(defaultDecision(withLink)).toBe('link');
    expect(linkTargetFor(withLink)).toMatchObject({ medicineId: 7, medicineName: 'Panadol' });

    const withMoh = row({
      suggestions: [
        {
          medicine_id: null,
          moh_id: 8,
          name: 'Panadol',
          name_ar: null,
          active_ingredient: null,
          official_price: null,
          source: 'moh',
        },
      ],
    });
    expect(defaultDecision(withMoh)).toBe('create');
    expect(createTargetFor(withMoh)).toMatchObject({ mohId: 8 });
  });

  it('stays pending without any resolvable target', () => {
    expect(defaultDecision(row())).toBe('pending');
    expect(initialDecisions([row()])).toEqual({ 1: 'pending' });
  });

  it('allows create from a complete input when no MOH suggestion exists', () => {
    expect(canCreate(row({ input: { ...row().input, active_ingredient: 'Paracetamol' } }))).toBe(true);
    expect(canCreate(row())).toBe(false);
    expect(canCreate(row({ errors: ['x'], proposed_moh_id: 2 }))).toBe(false);
  });

  it('merges initial targets from the resolved row', () => {
    expect(initialTargets([row({ medicine_id: 3, proposed_moh_id: 5 })])).toEqual({
      1: { medicineId: 3, medicineName: '', mohId: 5, mohName: '' },
    });
  });
});

describe('duplicate groups', () => {
  it('computes the winner for first and last', () => {
    expect(mergeWinnerRow([3, 7, 9], 'keep_first')).toBe(3);
    expect(mergeWinnerRow([3, 7, 9], 'keep_last')).toBe(9);
    expect(mergeWinnerRow([3, 7, 9], 'skip_all')).toBeNull();
    expect(mergeWinnerRow([], 'keep_first')).toBeNull();
  });

  it('lists groups waiting for a merge decision', () => {
    expect(groupsWithoutMerge({ g1: [1, 2], g2: [3, 4] }, { g1: 'keep_last' })).toEqual(['g2']);
  });

  it('blocks every row of an undecided group', () => {
    const rows = [row({ row: 1, duplicate_group: 'g1' }), row({ row: 2, duplicate_group: 'g1' })];
    const pending = pendingRowNumbers(rows, { g1: [1, 2] }, {}, { 1: 'skip', 2: 'skip' });
    expect(pending).toEqual([1, 2]);
  });

  it('only blocks the chosen winner inside a decided group', () => {
    const rows = [
      row({ row: 1, duplicate_group: 'g1' }),
      row({ row: 2, duplicate_group: 'g1' }),
    ];
    const decisions: ImportDecisions = { 1: 'skip', 2: 'pending' };

    expect(pendingRowNumbers(rows, { g1: [1, 2] }, { g1: 'keep_last' }, decisions)).toEqual([2]);
    expect(pendingRowNumbers(rows, { g1: [1, 2] }, { g1: 'keep_first' }, decisions)).toEqual([]);
    expect(pendingRowNumbers(rows, { g1: [1, 2] }, { g1: 'skip_all' }, decisions)).toEqual([]);
  });

  it('ignores invalid rows and counts missing merges separately', () => {
    const rows = [
      row({ row: 1, errors: ['bad'] }),
      row({ row: 2, decision: 'skip' }),
      row({ row: 3, duplicate_group: 'g1' }),
    ];
    const pending = pendingRowNumbers(rows, { g1: [3] }, { g1: 'keep_last' }, {});
    expect(pending).toEqual([3]);
    expect(blockingCount(rows, { g1: [3], g2: [4] }, { g1: 'keep_last' }, {})).toBe(3);
  });
});

describe('decision payload', () => {
  it('sends actions, targets, and only chosen merges', () => {
    const rows = [
      row({ row: 1, medicine_id: 4, decision: 'link' }),
      row({ row: 2, proposed_moh_id: 5, decision: 'create' }),
      row({ row: 3, decision: 'skip' }),
    ];
    const payload = buildDecisionPayload(
      rows,
      { g1: [1, 2], g2: [3] },
      { g1: 'keep_last' },
      { 1: 'link', 2: 'create', 3: 'skip' },
      { 2: { mohId: 55 } },
    );

    expect(payload).toEqual({
      rows: [
        { row: 1, action: 'link', medicine_id: 4 },
        { row: 2, action: 'create', moh_id: 55 },
        { row: 3, action: 'skip' },
      ],
      merges: { g1: 'keep_last' },
    });
  });

  it('forces invalid rows to skip', () => {
    const payload = buildDecisionPayload(
      [row({ row: 9, errors: ['bad'], medicine_id: 2, decision: 'link' })],
      {},
      {},
      { 9: 'link' },
      {},
    );
    expect(payload.rows).toEqual([{ row: 9, action: 'skip' }]);
  });

  it('downgrades link without a target and drops an absent moh id', () => {
    const payload = buildDecisionPayload(
      [row({ row: 1 }), row({ row: 2, input: { ...row().input, active_ingredient: 'x' } })],
      {},
      {},
      { 1: 'link', 2: 'create' },
      {},
    );
    expect(payload.rows).toEqual([
      { row: 1, action: 'skip' },
      { row: 2, action: 'create' },
    ]);
  });
});
