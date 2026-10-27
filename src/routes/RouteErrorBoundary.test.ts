/**
 * Regression tests for the route crash screen.
 *
 * WHAT THIS SUITE CAN AND CANNOT PROVE
 * ------------------------------------
 * The runner is `environment: 'node'` (see vitest.config.ts) and this repo has
 * no DOM implementation installed. Error boundaries are a CLIENT-ONLY React
 * feature: `renderToStaticMarkup` runs no commit phase, so a throw propagates
 * straight out instead of being caught. Trying to test the catch that way
 * fails for a reason that has nothing to do with the component.
 *
 * So this suite covers what is both important and genuinely testable:
 *   1. chunk-failure classification — the branching that decides which copy and
 *      which recovery actions the user sees;
 *   2. the i18n contract — every language must carry the full `crash` block,
 *      because `CrashScreen` renders OUTSIDE `LanguageProvider` at the root and
 *      a missing key would crash the crash screen.
 *
 * The catch itself was verified in the browser during development, not here.
 * If a DOM environment is ever added, the gap to close first is: render
 * <ErrorBoundary><Thrower/></ErrorBoundary>, assert the fallback appears.
 */
import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from '@/routes/chunkLoadError';
import { AR } from '@/lib/i18n';
import { EN } from '@/lib/lang/en';

describe('isChunkLoadError', () => {
  it('detects the Vite / native ESM message', () => {
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://app.test/assets/MedicinesPage-abc123.js',
    );
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('detects the Firefox / older Safari wording', () => {
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('detects the webpack wording', () => {
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
  });

  it('detects ChunkLoadError by name', () => {
    const err = new Error('boom');
    err.name = 'ChunkLoadError';
    expect(isChunkLoadError(err)).toBe(true);
  });

  it('accepts a raw string', () => {
    expect(isChunkLoadError('Loading chunk 7 failed.')).toBe(true);
  });

  it('does NOT flag an ordinary render error as a chunk failure', () => {
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')")),
    ).toBe(false);
  });

  it('does NOT flag a bare "Failed to fetch" network error', () => {
    // A plain fetch failure is retryable; calling it a stale build would push
    // the user to reload when a retry was the right move.
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('handles nullish and exotic input without throwing', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
    expect(isChunkLoadError(0)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    // An object with a message but no Error prototype still works.
    expect(isChunkLoadError({ message: 'Loading chunk 3 failed.' })).toBe(true);
  });
});

describe('crash screen copy', () => {
  /**
   * `CrashScreen` reads `STR.crash` unconditionally AND falls back to `AR` when
   * no provider is mounted. Two ways that breaks, both caught here:
   *   · a language missing the block entirely  → `C` is undefined → crash loop;
   *   · a language missing one leaf            → the button label renders blank.
   */
  const KEYS = [
    'title',
    'body',
    'chunk_title',
    'chunk_body',
    'retry',
    'reload',
    'home',
    'details',
  ] as const;

  for (const [name, STR] of [
    ['AR', AR],
    ['EN', EN],
  ] as const) {
    it(`${name} carries every crash key, non-empty`, () => {
      for (const key of KEYS) {
        const value = STR.crash[key];
        expect(value, `${name}.crash.${key} is missing`).toBeTypeOf('string');
        expect(value.trim().length, `${name}.crash.${key} is blank`).toBeGreaterThan(0);
      }
    });
  }

  it('keeps the chunk and generic variants distinguishable', () => {
    // If these ever collapse into the same string, the "reload is the only fix"
    // path silently loses its explanation and reads as a generic error.
    expect(AR.crash.title).not.toBe(AR.crash.chunk_title);
    expect(AR.crash.body).not.toBe(AR.crash.chunk_body);
    expect(EN.crash.title).not.toBe(EN.crash.chunk_title);
    expect(EN.crash.body).not.toBe(EN.crash.chunk_body);
  });

  it('does not leak Arabic copy into the English block', () => {
    // Cheap guard against a paste-the-wrong-block mistake: no Arabic glyphs.
    const arabic = /[\u0600-\u06FF]/;
    for (const key of KEYS) {
      expect(arabic.test(EN.crash[key]), `EN.crash.${key} contains Arabic`).toBe(false);
    }
  });
});
