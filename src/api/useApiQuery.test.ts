import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueryClient } from '@tanstack/react-query';
import { applyInvalidation } from './useApiQuery';

/**
 * F5 regression suite (Phase 1B.2).
 *
 * WHY THESE TESTS LIVE AT THE `QueryClient` LEVEL
 * `useApiMutation` is a hook, and this suite runs in a plain `node` environment
 * with no DOM — so the hook itself cannot be rendered. The invalidation RULE was
 * therefore extracted into `applyInvalidation`, and these tests drive that exact
 * production function against a REAL `QueryClient` with seeded data. Nothing is
 * mocked: the assertions read the same `isInvalidated` flag TanStack sets.
 *
 * THE BUG BEING PINNED
 * `invalidates` is `QueryKey | QueryKey[]` and a `QueryKey` is itself an array,
 * so `[]` is ambiguous. The old shape detection read `invalidates[0]`
 * (`undefined` for `[]`), classified `[]` as ONE EMPTY KEY, and called
 * `invalidateQueries({ queryKey: [] })`. TanStack treats a key as a PREFIX
 * filter — and the empty prefix matches EVERY query. An empty list therefore
 * invalidated the whole cache.
 */

const SALES = ['pharmacy', 'sales', 1] as const;
const CASH = ['pharmacy', 'cash', 1] as const;
const USERS = ['admin', 'users', 1] as const;

function seeded(): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SALES, [{ id: 1 }]);
  queryClient.setQueryData(CASH, [{ id: 2 }]);
  queryClient.setQueryData(USERS, [{ id: 3 }]);
  return queryClient;
}

function isInvalidated(queryClient: QueryClient, key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated ?? false;
}

describe('applyInvalidation — F5 cache invalidation', () => {
  it('does nothing when `invalidates` is omitted', () => {
    const queryClient = seeded();

    applyInvalidation(queryClient, undefined);

    expect(isInvalidated(queryClient, SALES)).toBe(false);
    expect(isInvalidated(queryClient, CASH)).toBe(false);
    expect(isInvalidated(queryClient, USERS)).toBe(false);
  });

  it('treats an empty array as "no keys", never as "every key"', () => {
    const queryClient = seeded();

    applyInvalidation(queryClient, []);

    // 🔴 The regression: before the guard this marked ALL THREE as invalidated.
    expect(isInvalidated(queryClient, SALES)).toBe(false);
    expect(isInvalidated(queryClient, CASH)).toBe(false);
    expect(isInvalidated(queryClient, USERS)).toBe(false);
  });

  it('invalidates exactly one key and leaves unrelated entries untouched', () => {
    const queryClient = seeded();

    applyInvalidation(queryClient, SALES);

    expect(isInvalidated(queryClient, SALES)).toBe(true);
    expect(isInvalidated(queryClient, CASH)).toBe(false);
    expect(isInvalidated(queryClient, USERS)).toBe(false);
  });

  it('invalidates every key of a multi-key list, and only those', () => {
    const queryClient = seeded();

    applyInvalidation(queryClient, [SALES, USERS]);

    expect(isInvalidated(queryClient, SALES)).toBe(true);
    expect(isInvalidated(queryClient, USERS)).toBe(true);
    expect(isInvalidated(queryClient, CASH)).toBe(false);
  });

  it('documents the TanStack behaviour that made the empty array dangerous', async () => {
    const queryClient = seeded();

    // Not production code — this CHARACTERIZES the library: an empty key is a
    // prefix match against every cached query. It is the reason the guard above
    // must exist, so it is asserted rather than assumed.
    await queryClient.invalidateQueries({ queryKey: [] });

    expect(isInvalidated(queryClient, SALES)).toBe(true);
    expect(isInvalidated(queryClient, CASH)).toBe(true);
    expect(isInvalidated(queryClient, USERS)).toBe(true);
  });
});

/* ========================================================================== */
/* G4 — mutation → invalidation WIRING (STRUCTURAL GUARD)                     */
/* ========================================================================== */

/**
 * ⚠️ STRUCTURAL GUARD — NOT A RUNTIME INTEGRATION TEST.
 *
 * WHAT IT PROVES
 * That `src/api/useApiQuery.ts` still calls `applyInvalidation(queryClient,
 * invalidates)` from inside the `onSuccess` callback of the `useMutation`
 * config, and nowhere else.
 *
 * WHY IT IS NOT A RUNTIME TEST
 * `useApiMutation` is a React hook. This suite runs in a plain `node`
 * environment: there is no DOM, no jsdom, and no react-test-renderer — adding
 * one is out of scope, and `react-dom/server` never runs effects or mutations,
 * so it cannot exercise this path either. The five tests above drive the
 * extracted RULE, but they would ALL still pass if the call at the hook's
 * `onSuccess` were deleted — the rule would simply never be invoked. That is the
 * gap this guard closes.
 *
 * WHAT IT DOES NOT PROVE
 * It reads SOURCE TEXT, so it cannot prove what the browser does at runtime. It
 * also cannot prove TanStack's own semantics (that `onSuccess` runs only on
 * success) — that is library behaviour, asserted here only by checking that
 * invalidation is declared exactly once, on the success path.
 *
 * HOW IT AVOIDS BRITTLENESS
 * No line numbers, no whitespace matching, no `includes()` on the whole file.
 * Comments are stripped FIRST (so a leftover comment mentioning the call cannot
 * satisfy the guard), then the `onSuccess` body is located by BRACE MATCHING
 * after `useMutation<`. Two sensitivity self-checks below prove the guard
 * actually fails on the regressions it is meant to catch.
 */

const SOURCE = readFileSync(
  fileURLToPath(new URL('./useApiQuery.ts', import.meta.url)),
  'utf8',
);

/** The production call shape, tolerant only of spacing. */
const CALL = /applyInvalidation\s*\(\s*queryClient\s*,\s*invalidates\s*\)/;

// Strip comments so a mention inside a comment can never satisfy the guard.
// Block comments go first; line comments then exclude the `//` in `https://`.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Returns the `{ ... }` body of `marker` (e.g. "onSuccess:") by brace-matching
// from the first `{` after it. Only brace depth is assumed — never formatting.
function extractCallbackBody(source: string, marker: string): string | null {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const open = source.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

// Locates the mutation config first (`useMutation<`), then its `onSuccess` body.
function successPathBody(source: string): string | null {
  const stripped = stripComments(source);
  const mutationAt = stripped.indexOf('useMutation<');
  if (mutationAt === -1) return null;
  return extractCallbackBody(stripped.slice(mutationAt), 'onSuccess:');
}

describe('useApiMutation → applyInvalidation wiring (STRUCTURAL GUARD)', () => {
  it('keeps the invalidation call inside the mutation success path', () => {
    const body = successPathBody(SOURCE) ?? '';

    // A failed extraction must fail loudly rather than pass on an empty string.
    expect(body.length).toBeGreaterThan(20);
    expect(body).toMatch(CALL);
  });

  it('declares invalidation exactly once — success path only, never on error', () => {
    const stripped = stripComments(SOURCE);
    const occurrences = stripped.match(new RegExp(CALL.source, 'g')) ?? [];

    // Adding the same call to onError/onSettled would make this 2.
    expect(occurrences).toHaveLength(1);
  });

  it('is not satisfied by a comment alone (sensitivity self-check)', () => {
    const commented = `useMutation<A, B, C>({
  mutationFn: f,
  onSuccess: () => {
    // applyInvalidation(queryClient, invalidates);
  },
});`;

    const body = successPathBody(commented) ?? '';
    expect(body.length).toBeGreaterThan(5);
    expect(body).not.toMatch(CALL);
  });

  it('fails when the call is removed from the real success path (sensitivity)', () => {
    const mutated = SOURCE.replace(new RegExp(CALL.source, 'g'), '');

    // The body must still be EXTRACTABLE — otherwise this test would pass for
    // the wrong reason (a broken extractor rather than a detected removal).
    const extracted = successPathBody(mutated);
    expect(extracted).not.toBeNull();
    expect(extracted).not.toMatch(CALL);
  });
});
