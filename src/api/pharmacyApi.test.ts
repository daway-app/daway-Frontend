import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createPharmacyApi } from './pharmacyApi';
import type { ApiIncomingOrder, ApiUncategorizedMedicine } from './pharmacyTypes';

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

const incomingOrder: ApiIncomingOrder = {
  id: 41, order_id: 9, pharmacy_id: 2, pharmacy_name: 'صيدلية الاختبار',
  patient: { name: 'عبود' }, order_status: 'ready', status: 'ready',
  payment_status: 'problem_reported', fulfillment_method: 'delivery', currency: 'ILS',
  subtotal: 20, discount: 0, shipping_fee: 0, commission: 0, total: 20,
  delivered_at: null, created_at: '2026-10-31 10:00:00',
  items: [{ id: 1, medicine_trade_name: 'Panadol', quantity: 2, unit_price: 10, total_price: 20 }],
};

describe('pharmacy incoming orders API', () => {
  it('keeps the list response pagination and requests the exact authenticated endpoint', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ success: true, data: [incomingOrder], pagination: { total: 1, per_page: 20, current_page: 2, last_page: 2 } });

    await expect(createPharmacyApi(client).incomingOrders(2)).resolves.toMatchObject({
      data: [incomingOrder], pagination: { current_page: 2, last_page: 2 },
    });
    expect(get).toHaveBeenCalledWith('/api/pharmacy/sub-orders', { query: { page: 2 }, signal: undefined });
  });

  it('loads only the requested pharmacy sub-order detail', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ success: true, data: incomingOrder });

    await expect(createPharmacyApi(client).incomingOrder(41)).resolves.toEqual(incomingOrder);
    expect(get).toHaveBeenCalledWith('/api/pharmacy/sub-orders/41', { signal: undefined });
  });
});

describe('pharmacy platform settlements API', () => {
  it('loads the pharmacy settlement list with pagination', async () => {
    const { client, get } = fakeClient();
    const row = { id: 7, pharmacy_id: 2, pharmacy_name: 'صيدلية الاختبار', period_start: '2026-10-27', period_end: '2026-11-02', currency: 'ILS', orders_total: 100, adjustments_total: -10, net_total: 90, status: 'paid', transfer_reference: 'BANK-7', paid_at: '2026-11-01T12:00:00Z', items: [], adjustments: [] };
    get.mockResolvedValue({ success: true, data: [row], pagination: { total: 1, per_page: 20, current_page: 1, last_page: 1 } });

    await expect(createPharmacyApi(client).platformSettlements()).resolves.toMatchObject({ data: [row], pagination: { total: 1 } });
    expect(get).toHaveBeenCalledWith('/api/pharmacy/accounting/platform-settlements', { query: { page: 1 }, signal: undefined });
  });

  it('loads only the requested pharmacy settlement details', async () => {
    const { client, get } = fakeClient();
    const row = { id: 7, pharmacy_id: 2, pharmacy_name: 'صيدلية الاختبار', period_start: '2026-10-27', period_end: '2026-11-02', currency: 'ILS', orders_total: 100, adjustments_total: 0, net_total: 100, status: 'draft', transfer_reference: null, paid_at: null, items: [], adjustments: [] };
    get.mockResolvedValue({ success: true, data: row });

    await expect(createPharmacyApi(client).platformSettlement(7)).resolves.toEqual(row);
    expect(get).toHaveBeenCalledWith('/api/pharmacy/accounting/platform-settlements/7', { signal: undefined });
  });
});

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
