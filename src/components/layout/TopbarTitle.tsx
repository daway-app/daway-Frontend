/**
 * Topbar title block — the location label shown at the top of both shells.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT AN `<h1>` ANY MORE (and why it is its own component)
 * ─────────────────────────────────────────────────────────────────────────────
 * Both `Topbar` (pharmacy) and `AdminLayout` (admin) used to render:
 *
 *     <div className="topbar-title-group">
 *       <h1>{heading.title}</h1>
 *       <p>{heading.subtitle}</p>
 *     </div>
 *
 * That `<h1>` is the heading for the WHOLE shell — it is mounted once and never
 * unmounts while the user navigates. Every page then rendered its own primary
 * heading as well (`<PageHeader>` → `<h1>`, or a literal `<h1>` in the page), so
 * 36 authenticated pages announced **two** level-1 headings to a screen reader,
 * the first of which described the section rather than the page.
 *
 * A page must own exactly one primary heading. The topbar is a LOCATION
 * indicator, not the document title, so it is now a plain `<div>`. The text,
 * the surrounding `.topbar-title-group`, and the sibling `<p>` subtitle are
 * unchanged — only the semantics of the wrapper changed, which is why the two
 * CSS selectors that targeted `h1` moved to `.topbar-title` (see
 * `styles/layout/topbar.css` and the narrow-viewport rule in
 * `styles/layout/sidebar.css`).
 *
 * WHY A SHARED COMPONENT
 * ----------------------
 * The markup was duplicated verbatim in the two layouts. Extracting it means
 * the "no competing `<h1>`" guarantee is enforced in ONE place, and — because
 * this component is pure and takes only strings — it can be rendered for real
 * in a unit test (`renderToStaticMarkup`). Rendering `Topbar` or `AdminLayout`
 * directly is not testable here: this repo's suite runs in `environment: 'node'`
 * with no DOM, and both shells pull in auth context, TanStack Query and the
 * router. A test that grepped the source for `<h1` would prove nothing about
 * what actually renders; this does.
 */
export function TopbarTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="topbar-title-group">
      {/* NOT a heading: the page owns the only `<h1>` in the document. */}
      <div className="topbar-title">{title}</div>
      <p>{subtitle}</p>
    </div>
  );
}
