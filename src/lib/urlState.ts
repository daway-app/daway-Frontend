import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Typed URL search-state, shared by every list screen.
 *
 * A thin, schema-aware layer over react-router's `useSearchParams`: reads typed
 * values (string | number | boolean) from the URL, and WRITES with
 * `replace: true` so moving between filters never pollutes the history stack the
 * user would replay with the back button.
 *
 * Why URL params (not component state) for list filters: they are shareable,
 * back/forward-safe, and survive a full reload — exactly what a user expects
 * when they copy a filtered inventory or sales view.
 *
 * The pure core (`readUrlState` / `writeUrlState` / `clearUrlState`) is exported
 * separately from the hook so the serialization contract can be unit-tested in
 * a node-only environment (no jsdom in this project — see vitest.config.ts).
 */
export type ParamValue = string | number | boolean;

export interface UrlParamConfig {
  /** The URL key as it appears in the query string. */
  key: string;
  /** Coerce the raw string from the URL into typed state. May throw — the
   *  reader falls back to `default` when it does. */
  parse: (raw: string) => ParamValue;
  /** Serialize the typed state back to a string for the URL. */
  serialize: (value: ParamValue) => string;
  /** Value used when the param is absent, and the value that is OMITTED from
   *  the URL when written (so the canonical view has a clean query string). */
  default: ParamValue;
}

export type UrlSchema<T extends Record<string, ParamValue>> = Record<keyof T, UrlParamConfig>;

export interface UrlStateResult<T extends Record<string, ParamValue>> {
  state: T;
  /** Update one or several params — writes via `replace()`. */
  set: (updates: Partial<T>) => void;
  /** Reset every param in this schema back to its default (removes them). */
  reset: () => void;
}

/** Read every field in the schema out of a query string. Pure. */
export function readUrlState<T extends Record<string, ParamValue>>(
  searchParams: URLSearchParams,
  schema: UrlSchema<T>,
): T {
  return Object.fromEntries(
    Object.entries(schema).map(([field, cfg]) => {
      const raw = searchParams.get(cfg.key);
      if (raw === null) return [field, cfg.default];
      try {
        return [field, cfg.parse(raw)];
      } catch {
        return [field, cfg.default];
      }
    }),
  ) as T;
}

/**
 * Apply updates onto a query string. Pure — returns a NEW URLSearchParams.
 * A value equal to its schema `default` (or `undefined`/`null`) is removed, so
 * the unfiltered view carries no dead params.
 */
export function writeUrlState<T extends Record<string, ParamValue>>(
  prev: URLSearchParams,
  updates: Partial<T>,
  schema: UrlSchema<T>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const [field, value] of Object.entries(updates)) {
    const cfg = schema[field as keyof T];
    if (!cfg) continue;
    if (value === undefined || value === null || value === cfg.default) next.delete(cfg.key);
    else next.set(cfg.key, cfg.serialize(value as ParamValue));
  }
  return next;
}

/** Remove every key in the schema. Pure — returns a NEW URLSearchParams. */
export function clearUrlState<T extends Record<string, ParamValue>>(
  prev: URLSearchParams,
  schema: UrlSchema<T>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const cfg of Object.values(schema)) next.delete(cfg.key);
  return next;
}

/**
 * Create a typed URL-state hook bound to a param schema.
 * Usage:
 *   const { state, set } = useUrlState({
 *     tab: { key: 'tab', parse: String, serialize: String, default: 'all' },
 *   });
 */
export function useUrlState<T extends Record<string, ParamValue>>(
  schema: UrlSchema<T>,
): UrlStateResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  // Latest-ref so `set`/`reset` stay stable even though callers pass a fresh
  // schema literal on every render (avoids re-running effects that depend on them).
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const state = readUrlState(searchParams, schema);

  const set = useCallback(
    (updates: Partial<T>) => {
      setSearchParams((prev) => writeUrlState(prev, updates, schemaRef.current), { replace: true });
    },
    [setSearchParams],
  );

  const reset = useCallback(() => {
    setSearchParams((prev) => clearUrlState(prev, schemaRef.current), { replace: true });
  }, [setSearchParams]);

  return { state, set, reset };
}
