import { afterEach, expect, it, vi } from 'vitest';
import { createApiClient } from '@/api/client';
import { downloadAndSave } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('never starts saving when the body is cancelled after headers arrive', async () => {
  const createUrl = vi.spyOn(URL, 'createObjectURL');
  const createElement = vi.fn();
  vi.stubGlobal('document', { createElement });
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
  const client = createApiClient({
    getToken: () => 'token', setToken: () => {}, clearToken: () => {}, refresh: async () => null,
    baseUrl: 'https://api.test',
    fetchImpl: vi.fn(async (_url, init) => ({
      ok: true, status: 200,
      blob: () => new Promise<Blob>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        bodyStarted();
      }),
    } as Response)),
  });
  const controller = new AbortController();
  const saved = downloadAndSave(client.download('/receipt', { signal: controller.signal }), 'receipt.xlsx');
  const rejected = expect(saved).rejects.toMatchObject({ kind: 'timeout' });
  await started;
  controller.abort();
  await rejected;
  expect(createUrl).not.toHaveBeenCalled();
  expect(createElement).not.toHaveBeenCalled();
});

it('saves a successful download and releases the object URL', async () => {
  const blob = new Blob(['file']);
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const appendChild = vi.fn();
  vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild } });
  await downloadAndSave(Promise.resolve(blob), 'report.xlsx');
  expect(createUrl).toHaveBeenCalledWith(blob);
  expect(link.download).toBe('report.xlsx');
  expect(appendChild).toHaveBeenCalledWith(link);
  expect(link.click).toHaveBeenCalledOnce();
  expect(link.remove).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith('blob:test');
});
