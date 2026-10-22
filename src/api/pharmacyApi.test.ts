import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createPharmacyApi } from './pharmacyApi';
import type { ApiUncategorizedMedicine } from './pharmacyTypes';

function fakeClient() {
  const get = vi.fn();
  const patch = vi.fn();
  return {
    client: { get, patch } as unknown as ApiClient,
    get,
    patch,
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
