import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createAdminApi } from './adminApi';

describe('admin platform settlements API', () => {
  it('loads the pharmacy due list from the dedicated endpoint', async () => {
    const get = vi.fn().mockResolvedValue({ success: true, data: [{ pharmacy_id: 7, total_due: 42 }] });
    const api = createAdminApi({ get } as unknown as ApiClient);
    await expect(api.platformSettlementsDue()).resolves.toEqual([{ pharmacy_id: 7, total_due: 42 }]);
    expect(get).toHaveBeenCalledWith('/api/admin/platform-settlements/due', { signal: undefined });
  });

  it('uploads the proof and optional transfer reference as multipart form data', async () => {
    const post = vi.fn().mockResolvedValue({ success: true, data: [] });
    const api = createAdminApi({ post } as unknown as ApiClient);
    const file = new File([new Uint8Array([1, 2, 3])], 'transfer.pdf', { type: 'application/pdf' });
    await api.payPlatformPharmacy(7, file, ' BANK-7 ');

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0] as [string, FormData];
    expect(path).toBe('/api/admin/platform-settlements/pharmacies/7/pay');
    expect(body.get('receipt')).toBe(file);
    expect(body.get('transfer_reference')).toBe('BANK-7');
  });

  it('downloads a transfer receipt from the admin-only endpoint', async () => {
    const download = vi.fn().mockResolvedValue(new Blob(['notice']));
    const api = createAdminApi({ download } as unknown as ApiClient);
    await api.downloadPlatformSettlementReceipt(11);
    expect(download).toHaveBeenCalledWith('/api/admin/platform-settlements/11/receipt');
  });
});
