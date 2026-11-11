import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('on-demand Chart.js loader', () => {
  it('shares a script request and resolves only once the constructor exists', async () => {
    const script: { src?: string; onload?: () => void; onerror?: () => void; remove: () => void } = { remove: vi.fn() };
    const appendChild = vi.fn();
    const fakeWindow: { Chart?: unknown } = {};
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', { createElement: () => script, head: { appendChild } });
    const { loadChartLibrary } = await import('./loadChartLibrary');
    const first = loadChartLibrary();
    const second = loadChartLibrary();
    expect(first).toBe(second);
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(script.src).toBe('/vendor/chart.umd.js');
    fakeWindow.Chart = function Chart() {};
    script.onload?.();
    await expect(first).resolves.toBeUndefined();
  });

  it('allows another attempt after a network failure', async () => {
    const scripts: Array<{ onload?: () => void; onerror?: () => void; remove: () => void }> = [];
    const fakeWindow: { Chart?: unknown } = {};
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', {
      createElement: () => { const script = { remove: vi.fn() }; scripts.push(script); return script; },
      head: { appendChild: vi.fn() },
    });
    const { loadChartLibrary } = await import('./loadChartLibrary');
    const failed = loadChartLibrary();
    scripts[0].onerror?.();
    await expect(failed).rejects.toThrow('Could not load Chart.js');
    const retry = loadChartLibrary();
    expect(scripts).toHaveLength(2);
    fakeWindow.Chart = function Chart() {};
    scripts[1].onload?.();
    await expect(retry).resolves.toBeUndefined();
  });
});
