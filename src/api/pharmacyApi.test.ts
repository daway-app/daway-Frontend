import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createPharmacyApi } from './pharmacyApi';
import type { ApiUncategorizedMedicine } from './pharmacyTypes';

function fakeClient() {
  const get = vi.fn();
  const patch = vi.fn();
  const post = vi.fn();
  return {
    client: { get, patch, post } as unknown as ApiClient,
    get,
    patch,
    post,
  };
}

const row: ApiUncategorizedMedicine = {
  id: 11,
  medicine_id: 7,
  trade_name: 'PANADOL',
  trade_name_ar: 'بنادول',
  description: 'مسكن للألم',
  active_ingredient: 'Paracetamol',
  image_url: null,
  quantity: 12,
};

describe('pharmacy uncategorized API', () => {
  it('requests the paginated uncategorized endpoint with its filters', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({
      success: true,
      data: [row],
      pagination: { total: 21, per_page: 12, current_page: 2, last_page: 2 },
    });

    const api = createPharmacyApi(client);
    const result = await api.uncategorizedMedicines({
      q: 'para',
      page: 2,
      per_page: 12,
    });

    expect(get).toHaveBeenCalledWith('/api/pharmacy/medicines/uncategorized', {
      query: { q: 'para', page: 2, per_page: 12 },
      signal: undefined,
    });
    expect(result).toMatchObject({
      data: [row],
      pagination: { total: 21, per_page: 12, current_page: 2, last_page: 2 },
    });
  });

  it('assigns a category to the pharmacy medicine row', async () => {
    const { client, patch } = fakeClient();
    patch.mockResolvedValue({
      success: true,
      data: { medicine_id: 7, category_id: 3, subcategory_id: 4 },
    });

    const api = createPharmacyApi(client);
    const body = { category_id: 3, subcategory_id: 4 };

    await expect(api.assignMedicineCategory(11, body)).resolves.toEqual({
      medicine_id: 7,
      category_id: 3,
      subcategory_id: 4,
    });
    expect(patch).toHaveBeenCalledWith('/api/pharmacy/medicines/11/category', body);
  });
});

describe('pharmacy inventory import API', () => {
  it('posts decisions and returns the updated session', async () => {
    const { client, post } = fakeClient();
    const session = { uuid: 'abc', status: 'ready' };
    post.mockResolvedValue({ success: true, data: session });

    const api = createPharmacyApi(client);
    const body = {
      rows: [{ row: 2, action: 'link' as const, medicine_id: 9 }],
      merges: { g1: 'keep_last' as const },
    };

    await expect(api.decideImport('abc', body)).resolves.toEqual(session);
    expect(post).toHaveBeenCalledWith(
      '/api/pharmacy/inventory/import/abc/decide',
      body,
    );
  });

  it('returns the commit summary and the committed session', async () => {
    const { client, post } = fakeClient();
    const committed = {
      summary: {
        committed_rows: 4,
        skipped_rows: 1,
        created_medicines: 0,
        learned_aliases: 2,
        low_stock_rows: 0,
      },
      import: { uuid: 'abc', status: 'committed' },
    };
    post.mockResolvedValue({ success: true, data: committed });

    const api = createPharmacyApi(client);

    await expect(api.commitImport('abc')).resolves.toEqual(committed);
    expect(post).toHaveBeenCalledWith('/api/pharmacy/inventory/import/abc/commit');
  });

  it('cancels the session and exposes the error-report path', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, data: null });

    const api = createPharmacyApi(client);

    await expect(api.cancelImport('a b')).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith('/api/pharmacy/inventory/import/a%20b/cancel');
    expect(api.importErrorsPath('a b')).toBe(
      '/api/pharmacy/inventory/import/a%20b/errors',
    );
  });
});
