/**
 * Pure-logic tests for the URL-state core.
 *
 * `readUrlState` / `writeUrlState` / `clearUrlState` are plain functions over
 * `URLSearchParams`, so they run in this node-only vitest setup (no jsdom, per
 * project convention). The `useUrlState` hook is a thin wrapper over them and is
 * covered end-to-end by `tools/nav-smoke.mjs`, not here.
 */
import { describe, it, expect } from 'vitest';
import { readUrlState, writeUrlState, clearUrlState, type UrlSchema } from '@/lib/urlState';

type Filter = { tab: string; page: number; q: string };

const schema: UrlSchema<Filter> = {
  tab: { key: 'tab', parse: String, serialize: String, default: 'all' },
  page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  q: { key: 'q', parse: String, serialize: String, default: '' },
};

describe('readUrlState', () => {
  it('returns defaults for an empty query string', () => {
    expect(readUrlState(new URLSearchParams(''), schema)).toEqual({ tab: 'all', page: 1, q: '' });
  });

  it('parses present params, coercing numbers', () => {
    expect(readUrlState(new URLSearchParams('tab=low&page=3&q=para'), schema)).toEqual({
      tab: 'low',
      page: 3,
      q: 'para',
    });
  });

  it('falls back to default when a parse function throws', () => {
    const throwing: UrlSchema<{ n: number }> = {
      n: {
        key: 'n',
        parse: (r) => {
          const v = Number(r);
          if (Number.isNaN(v)) throw new Error('bad');
          return v;
        },
        serialize: String,
        default: 7,
      },
    };
    expect(readUrlState(new URLSearchParams('n=abc'), throwing)).toEqual({ n: 7 });
    expect(readUrlState(new URLSearchParams('n=42'), throwing)).toEqual({ n: 42 });
  });
});

describe('writeUrlState', () => {
  it('sets a non-default value', () => {
    expect(writeUrlState(new URLSearchParams(''), { tab: 'out' }, schema).get('tab')).toBe('out');
  });

  it('removes a param when the value equals its default', () => {
    const next = writeUrlState(new URLSearchParams('tab=out&q=para'), { tab: 'all' }, schema);
    expect(next.get('tab')).toBeNull();
    expect(next.get('q')).toBe('para'); // untouched
  });

  it('serializes numbers to strings', () => {
    expect(writeUrlState(new URLSearchParams(''), { page: 4 }, schema).get('page')).toBe('4');
  });

  it('preserves params it does not own', () => {
    const next = writeUrlState(new URLSearchParams('unrelated=1'), { tab: 'low' }, schema);
    expect(next.get('unrelated')).toBe('1');
    expect(next.get('tab')).toBe('low');
  });

  it('does not mutate the input params', () => {
    const prev = new URLSearchParams('tab=out');
    writeUrlState(prev, { tab: 'all' }, schema);
    expect(prev.get('tab')).toBe('out');
  });
});

describe('clearUrlState', () => {
  it('removes every schema key but keeps foreign params', () => {
    const next = clearUrlState(new URLSearchParams('tab=low&page=3&q=x&keep=me'), schema);
    expect(next.get('tab')).toBeNull();
    expect(next.get('page')).toBeNull();
    expect(next.get('q')).toBeNull();
    expect(next.get('keep')).toBe('me');
  });
});
