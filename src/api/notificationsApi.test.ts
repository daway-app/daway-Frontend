import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './client';
import { createNotificationsApi, NOTIFICATION_ENDPOINTS } from './notificationsApi';
import type { AppNotification } from './notificationTypes';

const notification: AppNotification = {
  id: 5,
  type: 'order_created',
  message: 'تم إنشاء طلب جديد',
  is_read: false,
  created_at: '2026-10-22 10:00:00',
  medicine: null,
};

function fakeClient() {
  const get = vi.fn();
  const post = vi.fn();
  return {
    client: { get, post } as unknown as ApiClient,
    get,
    post,
  };
}

describe('createNotificationsApi', () => {
  it('unwraps the list envelope and keeps its count + pagination', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({
      success: true,
      data: [notification],
      unread_count: 1,
      pagination: { total: 21, per_page: 20, current_page: 1, last_page: 2 },
    });

    const api = createNotificationsApi(client);
    const result = await api.list({ page: 2, type: 'order_created' });

    expect(get).toHaveBeenCalledWith(NOTIFICATION_ENDPOINTS.list, {
      query: { page: 2, per_page: undefined, type: 'order_created' },
      signal: undefined,
    });
    expect(result).toEqual({
      notifications: [notification],
      unreadCount: 1,
      pagination: { total: 21, per_page: 20, current_page: 1, last_page: 2 },
    });
  });

  it('derives a missing count and pagination defensively', async () => {
    const { client, get } = fakeClient();
    const read = { ...notification, id: 6, is_read: true };
    get.mockResolvedValue({ success: true, data: [notification, read] });

    const api = createNotificationsApi(client);
    const result = await api.list();

    expect(result.unreadCount).toBe(1);
    expect(result.pagination).toEqual({
      total: 2,
      per_page: 2,
      current_page: 1,
      last_page: 1,
    });
  });

  it('returns the unread count endpoint value', async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ success: true, data: { unread_count: 7 } });

    const api = createNotificationsApi(client);

    await expect(api.count()).resolves.toBe(7);
    expect(get).toHaveBeenCalledWith(NOTIFICATION_ENDPOINTS.count, {
      signal: undefined,
    });
  });

  it('marks one notification as read through the expected path', async () => {
    const { client, post } = fakeClient();
    const updated = { ...notification, is_read: true };
    post.mockResolvedValue({ success: true, data: updated });

    const api = createNotificationsApi(client);

    await expect(api.markRead(5)).resolves.toEqual(updated);
    expect(post).toHaveBeenCalledWith(NOTIFICATION_ENDPOINTS.read(5), undefined, {
      signal: undefined,
    });
  });

  it('marks all as read and returns the server message', async () => {
    const { client, post } = fakeClient();
    post.mockResolvedValue({ success: true, message: 'تم تحديد الكل' });

    const api = createNotificationsApi(client);

    await expect(api.markAllAsRead()).resolves.toBe('تم تحديد الكل');
    expect(post).toHaveBeenCalledWith(
      NOTIFICATION_ENDPOINTS.markAllAsRead,
      undefined,
      { signal: undefined },
    );
  });
});
