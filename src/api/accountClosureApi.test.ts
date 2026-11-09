import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createAdminApi } from './adminApi';
import { createPharmacyApi } from './pharmacyApi';
import type { AdminAccountClosureRequest } from './adminTypes';
import type { PharmacyAccountClosureState } from './pharmacyTypes';

function fakeClient() {
  const get = vi.fn();
  const post = vi.fn();
  return { client: { get, post } as unknown as ApiClient, get, post };
}

const pharmacyState: PharmacyAccountClosureState = {
  account_status: 'active',
  closed_at: null,
  request: {
    id: 7,
    status: 'pending',
    reason: 'إغلاق نهائي',
    created_at: '2026-11-05T09:00:00+00:00',
    reviewed_at: null,
    review_note: null,
    blockers: [{ key: 'ungrouped_dues', label: 'مستحقات لم تُجمَّع في تسوية', count: 3 }],
  },
  blockers: [{ key: 'ungrouped_dues', label: 'مستحقات لم تُجمَّع في تسوية', count: 3 }],
};

const adminRow: AdminAccountClosureRequest = {
  id: 7,
  subject_type: 'pharmacy',
  subject_id: 3,
  subject_name: 'صيدلية النور',
  status: 'pending',
  reason: 'إغلاق نهائي',
  blockers: [{ key: 'unpaid_settlements', label: 'تسويات غير مدفوعة', count: 1 }],
  review_note: null,
  reviewed_at: null,
  created_at: '2026-11-05T09:00:00+00:00',
};

describe('account closure API', () => {
  it('reads the pharmacy closure state and unwraps the envelope', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ success: true, data: pharmacyState });

    const api = createPharmacyApi(client);
    const result = await api.accountClosureState();

    expect(get).toHaveBeenCalledWith('/api/pharmacy/account/closure-request', { signal: undefined });
    expect(result).toEqual(pharmacyState);
  });

  it('submits a pharmacy closure request with the reason', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, message: 'ok', data: pharmacyState.request });

    const api = createPharmacyApi(client);
    await api.requestAccountClosure('إغلاق نهائي');

    expect(post).toHaveBeenCalledWith('/api/pharmacy/account/closure-request', {
      reason: 'إغلاق نهائي',
    });
  });

  it('passes the status filter through the admin query string', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ success: true, data: [adminRow] });

    const api = createAdminApi(client);
    const rows = await api.accountClosures('pending');

    expect(get).toHaveBeenCalledWith('/api/admin/account-closures?status=pending', {
      signal: undefined,
    });
    expect(rows).toEqual([adminRow]);
  });

  it('approves a closure with the review note', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, message: 'ok' });

    const api = createAdminApi(client);
    await api.approveAccountClosure(7, 'تمت التسوية');

    expect(post).toHaveBeenCalledWith('/api/admin/account-closures/7/approve', {
      note: 'تمت التسوية',
    });
  });

  it('rejects a closure with the reason', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, message: 'ok' });

    const api = createAdminApi(client);
    await api.rejectAccountClosure(7, 'بيانات ناقصة');

    expect(post).toHaveBeenCalledWith('/api/admin/account-closures/7/reject', {
      note: 'بيانات ناقصة',
    });
  });

  it('reopens a closed pharmacy by id', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, message: 'ok' });

    const api = createAdminApi(client);
    await api.reopenPharmacy(3);

    expect(post).toHaveBeenCalledWith('/api/admin/pharmacies/3/reopen', {});
  });
});
