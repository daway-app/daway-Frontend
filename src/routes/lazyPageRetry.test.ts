/**
 * Regression tests for the lazy-route loader's single retry.
 *
 * The behaviour being locked down, and why it matters:
 *
 * `React.lazy` caches its promise, and a REJECTED promise stays rejected for
 * the life of the page. The `LazyComponent` in `lazyPage()` is a module-level
 * constant, so it is never rebuilt. Before the retry, one transient network
 * failure permanently bricked that route until the user hard-reloaded — the
 * error screen's own "retry" button re-used the dead promise and re-failed
 * instantly, which is the worst possible UX (an action that provably cannot
 * work).
 *
 * The retry has to be narrow, so these tests pin BOTH directions:
 *   · a chunk-load failure IS retried (and succeeds on the second attempt);
 *   · anything else is NOT retried (no wasted round-trip, no delayed error);
 *   · there is exactly one retry (no request storm on a genuinely dead file).
 */
import { describe, it, expect, vi } from 'vitest';
import { loadWithRetry } from '@/routes/lazyPage';
import type { ModuleShape } from '@/routes/lazyPageResolve';

/** A stand-in module — `loadWithRetry` only forwards it, never inspects it. */
const MODULE: ModuleShape = { default: () => null } as unknown as ModuleShape;

/** A rejection shaped like a stale-build chunk 404. */
function chunkError(): Error {
  return new TypeError(
    'Failed to fetch dynamically imported module: /assets/MedicinesPage-abc123.js',
  );
}

describe('loadWithRetry', () => {
  it('returns the module on the first attempt when it succeeds', async () => {
    const loader = vi.fn().mockResolvedValue(MODULE);
    await expect(loadWithRetry(loader)).resolves.toBe(MODULE);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retries a chunk-load failure and returns the second result', async () => {
    const loader = vi.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce(MODULE);

    await expect(loadWithRetry(loader)).resolves.toBe(MODULE);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rethrows the SECOND error when the retry also fails', async () => {
    const second = chunkError();
    const loader = vi.fn().mockRejectedValueOnce(chunkError()).mockRejectedValueOnce(second);

    await expect(loadWithRetry(loader)).rejects.toBe(second);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('retries at most once — never a third attempt', async () => {
    const loader = vi.fn().mockRejectedValue(chunkError());

    await expect(loadWithRetry(loader)).rejects.toBeInstanceOf(TypeError);
    // 1 initial + 1 retry, full stop.
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry an ordinary error', async () => {
    const boom = new Error('lazyPage: no default or named component export found');
    const loader = vi.fn().mockRejectedValue(boom);

    await expect(loadWithRetry(loader)).rejects.toBe(boom);
    // A deterministic bug would fail identically forever; retrying only delays
    // the error screen.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a syntax error in the imported module', async () => {
    const loader = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <'));
    await expect(loadWithRetry(loader)).rejects.toBeInstanceOf(SyntaxError);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry a bare network error (retryable at a higher layer, not ici)', async () => {
    // `Failed to fetch` without the dynamic-import wording is an API call, not a
    // chunk fetch — the API layer has its own retry policy.
    const loader = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(loadWithRetry(loader)).rejects.toBeInstanceOf(TypeError);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('waits between attempts rather than hammering the network', async () => {
    vi.useFakeTimers();
    try {
      const loader = vi.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce(MODULE);

      const pending = loadWithRetry(loader);
      // Still only one call while the backoff is pending.
      expect(loader).toHaveBeenCalledTimes(1);

      await vi.runAllTimersAsync();
      await expect(pending).resolves.toBe(MODULE);
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
