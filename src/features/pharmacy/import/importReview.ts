import type {
  ApiImportDecision,
  ApiImportDecisionPayload,
  ApiImportMergeDecision,
  ApiImportRow,
  ApiImportSuggestion,
} from '@/api/pharmacyTypes';

export type ImportDecisions = Record<number, ApiImportDecision>;

export interface ImportTarget {
  medicineId?: number;
  medicineName?: string;
  mohId?: number;
  mohName?: string;
}

export type ImportTargets = Record<number, ImportTarget>;

export function linkTargetFor(row: ApiImportRow): ImportTarget | null {
  if (row.medicine_id !== null) {
    return {
      medicineId: row.medicine_id,
      medicineName: row.resolved_name ?? '',
    };
  }

  const hit = row.suggestions.find((s) => s.medicine_id !== null);
  if (!hit) return null;

  return {
    medicineId: hit.medicine_id ?? undefined,
    medicineName: hit.name ?? '',
  };
}

export function createTargetFor(row: ApiImportRow): ImportTarget | null {
  if (row.proposed_moh_id !== null) {
    return {
      mohId: row.proposed_moh_id,
      mohName: row.resolved_name ?? '',
    };
  }

  const hit = row.suggestions.find((s) => s.moh_id !== null);
  if (!hit) return null;

  return {
    mohId: hit.moh_id ?? undefined,
    mohName: hit.name ?? '',
  };
}

export function canLink(row: ApiImportRow): boolean {
  return linkTargetFor(row) !== null;
}

export function canCreate(row: ApiImportRow): boolean {
  if (row.errors.length > 0) return false;
  if (row.proposed_moh_id !== null) return true;
  if (row.suggestions.some((s) => s.moh_id !== null)) return true;

  return row.input.trade_name.trim() !== '' && (row.input.active_ingredient ?? '').trim() !== '';
}

export function defaultDecision(row: ApiImportRow): ApiImportDecision {
  if (row.errors.length > 0) return 'skip';
  if (row.decision !== 'pending') return row.decision;
  if (row.medicine_id !== null) return 'link';
  if (row.proposed_moh_id !== null) return 'create';

  if (row.suggestions.some((s) => s.medicine_id !== null)) return 'link';
  if (row.suggestions.some((s) => s.moh_id !== null)) return 'create';

  return 'pending';
}

export function initialDecisions(rows: ApiImportRow[]): ImportDecisions {
  const decisions: ImportDecisions = {};
  for (const row of rows) decisions[row.row] = defaultDecision(row);
  return decisions;
}

export function initialTargets(rows: ApiImportRow[]): ImportTargets {
  const targets: ImportTargets = {};
  for (const row of rows) {
    const link = linkTargetFor(row);
    const create = createTargetFor(row);
    targets[row.row] = { ...(link ?? {}), ...(create ?? {}) };
  }
  return targets;
}

export function mergeWinnerRow(
  rowNumbers: number[],
  decision: ApiImportMergeDecision | undefined,
): number | null {
  if (decision !== 'keep_first' && decision !== 'keep_last') return null;
  if (rowNumbers.length === 0) return null;
  return decision === 'keep_first'
    ? Math.min(...rowNumbers)
    : Math.max(...rowNumbers);
}

export function groupsWithoutMerge(
  groups: Record<string, number[]>,
  merges: Record<string, ApiImportMergeDecision>,
): string[] {
  return Object.keys(groups).filter((key) => merges[key] === undefined);
}

export function pendingRowNumbers(
  rows: ApiImportRow[],
  groups: Record<string, number[]>,
  merges: Record<string, ApiImportMergeDecision>,
  decisions: ImportDecisions,
): number[] {
  const pending: number[] = [];

  for (const [key, rowNumbers] of Object.entries(groups)) {
    if (merges[key] === undefined) pending.push(...rowNumbers);
  }

  for (const row of rows) {
    if (row.errors.length > 0) continue;

    if (row.duplicate_group !== null && groups[row.duplicate_group]) {
      const winner = mergeWinnerRow(
        groups[row.duplicate_group],
        merges[row.duplicate_group],
      );
      if (winner !== row.row) continue;
    }

    const decision = decisions[row.row] ?? defaultDecision(row);
    if (!['link', 'create', 'skip'].includes(decision)) pending.push(row.row);
  }

  return pending;
}

export function blockingCount(
  rows: ApiImportRow[],
  groups: Record<string, number[]>,
  merges: Record<string, ApiImportMergeDecision>,
  decisions: ImportDecisions,
): number {
  return pendingRowNumbers(rows, groups, merges, decisions).length
    + groupsWithoutMerge(groups, merges).length;
}

export function buildDecisionPayload(
  rows: ApiImportRow[],
  groups: Record<string, number[]>,
  merges: Record<string, ApiImportMergeDecision>,
  decisions: ImportDecisions,
  targets: ImportTargets,
): ApiImportDecisionPayload {
  const payloadRows: ApiImportDecisionPayload['rows'] = rows.map((row) => {
    let action = decisions[row.row] ?? defaultDecision(row);
    if (row.errors.length > 0) action = 'skip';

    if (action === 'link') {
      const medicineId = targets[row.row]?.medicineId ?? row.medicine_id ?? undefined;
      return medicineId === undefined
        ? { row: row.row, action: 'skip' }
        : { row: row.row, action, medicine_id: medicineId };
    }

    if (action === 'create') {
      const mohId = targets[row.row]?.mohId ?? row.proposed_moh_id ?? undefined;
      return mohId === undefined
        ? { row: row.row, action }
        : { row: row.row, action, moh_id: mohId };
    }

    return { row: row.row, action };
  });

  const payloadMerges: Record<string, ApiImportMergeDecision> = {};
  for (const key of Object.keys(groups)) {
    const decision = merges[key];
    if (decision !== undefined) payloadMerges[key] = decision;
  }

  return { rows: payloadRows, merges: payloadMerges };
}

export function suggestionLabel(suggestion: ApiImportSuggestion): string {
  return suggestion.name ?? suggestion.name_ar ?? '';
}
