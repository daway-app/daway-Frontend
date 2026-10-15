import type { ComponentType } from 'react';

/**
 * Pure resolution logic for `lazyPage` — split into its own module (with NO
 * React or component imports) so it can be unit-tested in this project's
 * node-only vitest setup.
 *
 * WHY THIS EXISTS: the original `lazyPage` accepted only component exports
 * whose `typeof` was `object` (true for `memo`/`forwardRef` wrappers), and
 * therefore rejected every page in this repo — all of which are plain
 * `export function PageName()`. The result was a hard runtime crash on every
 * route that typecheck, lint and `vite build` could not detect. The rule now
 * lives here, behind tests.
 */
export type AnyComponent = ComponentType<Record<string, unknown>>;

export type ModuleShape = {
  default?: unknown;
} & {
  [key: string]: unknown;
};

/**
 * A React component is a function (plain component) OR an object carrying the
 * React element `$$typeof` marker (`memo` / `forwardRef` / `lazy`).
 */
export function isComponent(value: unknown): value is AnyComponent {
  if (typeof value === 'function') return true;
  return value != null && typeof value === 'object' && '$$typeof' in value;
}

/**
 * Pick the page component out of a resolved module.
 *
 * Order: an explicit `default`, else a PascalCase named export (the component
 * convention, and a guard against resolving an exported helper instead), else
 * the only component-like export if there is exactly one.
 */
export function resolveLazyComponent(mod: ModuleShape): AnyComponent {
  if (isComponent(mod.default)) return mod.default;

  const candidates = Object.entries(mod).filter(([key, v]) => key !== 'default' && isComponent(v));
  const pascal = candidates.find(([key]) => /^[A-Z]/.test(key));
  const chosen = pascal?.[1] ?? (candidates.length === 1 ? candidates[0][1] : undefined);

  if (!isComponent(chosen)) throw new Error('lazyPage: no default or named component export found');
  return chosen;
}
