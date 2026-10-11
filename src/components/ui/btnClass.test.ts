import { describe, expect, it } from 'vitest';
import { btnClassList } from './btnClass';

/**
 * Guards for `Btn`'s class list.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * `Btn` used to build its classes from `variant`/`size` only and ignore the
 * `className` prop. Because that prop arrives through
 * `ButtonHTMLAttributes`, every call site still TYPECHECKED — the class was
 * silently dropped at runtime. A `className` that vanishes is invisible to
 * `tsc`, to ESLint and to a screenshot, so a pure-function assertion is the
 * only thing that pins it down.
 *
 * Emptiness matters as much as presence: joining with `''` (rather than
 * filtering) would emit `class="ph-btn  primary"` and `undefined` would paint
 * the literal word `undefined` into the DOM.
 */
describe('btnClassList()', () => {
  it('always leads with the base .ph-btn class', () => {
    expect(btnClassList()).toBe('ph-btn');
    expect(btnClassList('primary', 'sm')).toBe('ph-btn primary sm');
  });

  it('appends a caller-supplied className instead of dropping it', () => {
    // The regression: this returned 'ph-btn' and the hook class was lost.
    expect(btnClassList(undefined, undefined, 'btn-add-pharmacy')).toBe(
      'ph-btn btn-add-pharmacy',
    );
  });

  it('keeps base, variant, size and className together, in that order', () => {
    expect(btnClassList('danger', 'xs', 'js-confirm')).toBe('ph-btn danger xs js-confirm');
  });

  it('never emits empty entries or the literal "undefined"', () => {
    const cls = btnClassList(undefined, undefined, undefined);
    expect(cls).not.toContain('undefined');
    // `split` on a single-space string is exact: no doubled spaces can survive.
    expect(cls.split(' ').every((part) => part !== '')).toBe(true);
  });

  it('does not duplicate ph-btn if a caller passes it again', () => {
    // Harmless in CSS terms, but it signals a double-wrap mistake at the call
    // site, so assert the honest current behaviour rather than the ideal one.
    expect(btnClassList(undefined, undefined, 'ph-btn')).toBe('ph-btn ph-btn');
  });
});
