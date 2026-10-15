/**
 * Regression tests for `lazyPage`'s module→component resolution.
 *
 * These exist because the original implementation rejected PLAIN FUNCTION
 * components (it only accepted objects with `$$typeof`, i.e. memo/forwardRef
 * wrappers). Every page in this repo is `export function PageName()`, so the
 * app crashed on every route at runtime — while typecheck, lint and
 * `vite build` all passed. The first case below is that exact regression.
 */
import { describe, it, expect } from 'vitest';
import { isComponent, resolveLazyComponent } from '@/routes/lazyPageResolve';

/** A stand-in for a plain function component. */
function PageName() {
  return null;
}
/** A stand-in for a memo()/forwardRef() wrapper — an object with `$$typeof`. */
const memoLike = { $$typeof: Symbol.for('react.memo'), type: PageName };

describe('isComponent', () => {
  it('accepts a plain function component', () => {
    expect(isComponent(PageName)).toBe(true);
  });

  it('accepts a memo/forwardRef-style object with $$typeof', () => {
    expect(isComponent(memoLike)).toBe(true);
  });

  it('rejects non-components', () => {
    expect(isComponent(null)).toBe(false);
    expect(isComponent(undefined)).toBe(false);
    expect(isComponent('LoginPage')).toBe(false);
    expect(isComponent(42)).toBe(false);
    expect(isComponent({})).toBe(false);
  });
});

describe('resolveLazyComponent', () => {
  it('resolves a plain named function export (the regression)', () => {
    expect(resolveLazyComponent({ LoginPage: PageName })).toBe(PageName);
  });

  it('prefers an explicit default export', () => {
    const other = () => null;
    expect(resolveLazyComponent({ default: PageName, Other: other })).toBe(PageName);
  });

  it('accepts a memo-style default export', () => {
    expect(resolveLazyComponent({ default: memoLike })).toBe(memoLike);
  });

  it('prefers a PascalCase export over a lowercase helper', () => {
    const helper = () => null;
    expect(resolveLazyComponent({ formatDate: helper, MedicinesPage: PageName })).toBe(PageName);
  });

  it('accepts a single lowercase component-like export as a last resort', () => {
    expect(resolveLazyComponent({ weirdName: PageName })).toBe(PageName);
  });

  it('ignores non-component exports', () => {
    expect(resolveLazyComponent({ PageName, MAX: 10, label: 'x' })).toBe(PageName);
  });

  it('throws when nothing component-like is exported', () => {
    expect(() => resolveLazyComponent({ MAX: 10, label: 'x' })).toThrow(/no default or named/);
    expect(() => resolveLazyComponent({})).toThrow(/no default or named/);
  });

  it('throws when several lowercase exports are ambiguous', () => {
    const a = () => null;
    const b = () => null;
    expect(() => resolveLazyComponent({ a, b })).toThrow(/no default or named/);
  });
});
