import type { BtnSize, BtnVariant } from './index';

/**
 * Build a `Btn`'s class list.
 *
 * Lives in its OWN module rather than beside `Btn` because `index.tsx` must
 * export components only — a mixed component/function module defeats React
 * Fast Refresh (`react-refresh/only-export-components`), which is a lint
 * warning this project treats as noise it will not carry.
 *
 * It is a free function, not inlined into `Btn`, so it can be unit-tested: this
 * project's Vitest environment is `node`, so no component can be rendered
 * here — but the bug it guards was purely about the returned string.
 *
 * 🔴 THE BUG IT GUARDS: `Btn` used to build classes from `variant`/`size`
 * alone and silently DROP the `className` prop. Because that prop arrives via
 * `ButtonHTMLAttributes`, every call site still type-checked. A vanished class
 * is invisible to `tsc`, to ESLint and to a screenshot.
 */
export function btnClassList(
  variant?: BtnVariant,
  size?: BtnSize,
  className?: string,
): string {
  return ['ph-btn', variant, size, className].filter(Boolean).join(' ');
}
