/**
 * Multi-select helpers for list screens.
 *
 * WHY THIS IS A MODULE AND NOT `Set` OPERATIONS INLINE
 * ----------------------------------------------------
 * Three details around a "select all" checkbox are easy to get subtly wrong,
 * and each one produces a bug that looks like data rather than code:
 *
 *   · **The header checkbox is tri-state.** "N selected" and "nothing
 *     selected" are not enough: when *some* rows are selected the header must
 *     be `indeterminate`, which is a DOM *property* — `checkboxes.indeterminate`
 *     — not the `checked` attribute. A naive implementation sets `checked` and
 *     the state silently collapses to a plain boolean, so the user cannot tell
 *     a partial selection from a full one.
 *   · **Selecting a whole page must not depend on keeping the previous set
 *     coherent.** If the id list is rebuilt from rendered order each time, a
 *     row that vanishes between two renders (a refetch that drops a sold-out
 *     line) leaves a phantom id selected forever.
 *   · **The selected count must be INTERSECTED with the visible rows.** A row
 *     filtered out or deleted while still present in the id array must not be
 *     counted, or "3 selected" is shown while only 2 rows carry a tick.
 *
 * So the state derivation lives here, is pure, and is unit-tested. The
 * component keeps only `Set<number>` state and one `useEffect` that pushes
 * `indeterminate` onto the DOM node.
 */

/** How a "select all" control should render for the current selection. */
export type SelectionState = 'none' | 'some' | 'all';

/**
 * Derive the tri-state from the selected ids and the page's row ids.
 *
 * `none` when nothing visible is selected, `all` when every visible row is
 * selected, `some` otherwise. An empty `rowIds` is `none`: a header that reads
 * "all" over an empty list would be a lie.
 *
 * Only ids present in BOTH sets count, so a stale id (row removed by a refetch)
 * cannot keep the control out of `none`.
 */
export function selectionState(
  selected: ReadonlySet<number>,
  rowIds: readonly number[],
): SelectionState {
  if (rowIds.length === 0) return 'none';
  let hits = 0;
  for (const id of rowIds) {
    if (selected.has(id)) hits += 1;
  }
  if (hits === 0) return 'none';
  return hits === rowIds.length ? 'all' : 'some';
}

/** `indeterminate` is true for exactly the `some` state. */
export function isIndeterminate(state: SelectionState): boolean {
  return state === 'some';
}

/**
 * The next selection after toggling the "select all" control.
 *
 * The rule is the one every file manager uses: if everything visible is
 * already selected, clear the page; otherwise select the whole page. `some`
 * behaves like `none` (it fills the page) because the universal expectation
 * when you click a half-ticked box is "give me all of them".
 *
 * Returns a NEW `Set` — the caller's state must never be mutated in place.
 * Ids outside `rowIds` are preserved, so toggling the header on a filtered
 * view does not silently discard selections made under another filter.
 */
export function toggleAll(
  selected: ReadonlySet<number>,
  rowIds: readonly number[],
): Set<number> {
  const next = new Set(selected);
  if (selectionState(selected, rowIds) === 'all') {
    for (const id of rowIds) next.delete(id);
  } else {
    for (const id of rowIds) next.add(id);
  }
  return next;
}

/** Add or remove one row. Returns a NEW `Set`. */
export function toggleOne(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * The selected ids that are still present in `rowIds`, in row order.
 *
 * Use this — not `Array.from(selected)` — for anything that acts on the
 * selection: it drops stale ids and gives a deterministic order, so a bulk
 * request is reproducible and its progress text ("3 of 5") is truthful.
 */
export function selectedIds(
  selected: ReadonlySet<number>,
  rowIds: readonly number[],
): number[] {
  return rowIds.filter((id) => selected.has(id));
}
