/**
 * Normalise a `DataTable` `columns` prop into a safe list of header cells.
 *
 * THE BUG THIS PREVENTS
 * ---------------------
 * `columns` is declared `Array<ReactNode | ColumnDef>`. `ReactNode` is a very
 * wide type — it includes `string`, `number`, `boolean`, `null`, `undefined`
 * and arrays of all of those. The declaration therefore ACCEPTS several values
 * the renderer cannot handle, and TypeScript reports nothing.
 *
 * Two shapes break the header in ways that are hard to attribute to the caller:
 *
 *   · `columns={[]}` — `Array.prototype.map` over an empty array yields
 *     `[]`, so React renders `<thead><tr></tr></thead>`. Because `.ph-table th`
 *     carries the header background and border, that empty row still paints a
 *     thin coloured strip. The table looks like it loaded a broken header
 *     rather than no header.
 *
 *   · `columns="الدواء"` — a bare string is a valid `ReactNode`, so it
 *     typechecks. But React treats a string child by mapping over its
 *     CHARACTERS (this is what makes `{'ab'}` render as two text nodes inside
 *     one element — but here the string is an *element* in a mapped array, so
 *     each character becomes its own `<th>`). A six-letter Arabic word produced
 *     six header columns, none of them related to the body.
 *
 * WHAT IS KEPT
 * ------------
 * Falsy-but-real entries are dropped (`null`, `undefined`, `false`, `''`) —
 * React renders nothing for them anyway, so a caller conditionally omitting a
 * column (`cond ? def : null`) keeps working and simply shifts the header.
 *
 * `0` is deliberately NOT dropped. It is falsy, but a numeric column header of
 * `0` is a legitimate value and React renders it as "0".
 *
 * Anything that is not an array at all is treated as "no columns", which
 * renders the table body with no header row — degraded, but never misleading.
 */
export function normaliseColumns<T>(columns: readonly T[] | unknown): T[] {
  if (!Array.isArray(columns)) return [];

  return (columns as T[]).filter(
    (c) => c !== null && c !== undefined && c !== false && c !== '',
  );
}
