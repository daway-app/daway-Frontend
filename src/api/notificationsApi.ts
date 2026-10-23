import type { ApiClient } from './client';
import type { ApiSuccess } from './types';
import type {
  AppNotification,
  NotificationList,
  NotificationListQuery,
  NotificationPagination,
} from './notificationTypes';

/**
 * Notification endpoints — shared by the pharmacy AND admin sessions.
 *
 * Every path is verified from `routes/api.php` and sits behind
 * `auth:sanctum`. This module is intentionally client-agnostic: the caller
 * passes whichever isolated client belongs to the active role, so a pharmacy
 * token and an admin token can never be mixed.
 */

export const NOTIFICATION_ENDPOINTS = {
  list: '/api/notifications',
  count: '/api/notifications/count',
  read: (id: number) => `/api/notifications/${encodeURIComponent(String(id))}/read`,
  markAllAsRead: '/api/notifications/mark-all-as-read',
} as const;

interface NotificationListResponse extends ApiSuccess<AppNotification[]> {
  unread_count?: number;
  pagination?: NotificationPagination;
}

interface NotificationCountResponse {
  success: boolean;
  data?: {
    unread_count?: number;
  };
}

function fallbackPagination(notifications: AppNotification[]): NotificationPagination {
  return {
    total: notifications.length,
    per_page: notifications.length,
    current_page: 1,
    last_page: 1,
  };
}

function normaliseUnreadCount(
  value: number | undefined,
  notifications: AppNotification[],
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  return notifications.filter((notification) => !notification.is_read).length;
}

export function createNotificationsApi(client: ApiClient) {
  return {
    async list(
      query: NotificationListQuery = {},
      signal?: AbortSignal,
    ): Promise<NotificationList> {
      const response = await client.get<NotificationListResponse>(
        NOTIFICATION_ENDPOINTS.list,
        {
          query: {
            page: query.page,
            per_page: query.per_page,
            type: query.type,
          },
          signal,
        },
      );

      const notifications = response.data ?? [];
      return {
        notifications,
        unreadCount: normaliseUnreadCount(response.unread_count, notifications),
        pagination: response.pagination ?? fallbackPagination(notifications),
      };
    },

    async count(signal?: AbortSignal): Promise<number> {
      const response = await client.get<NotificationCountResponse>(
        NOTIFICATION_ENDPOINTS.count,
        { signal },
      );
      return normaliseUnreadCount(response.data?.unread_count, []);
    },

    async markRead(id: number, signal?: AbortSignal): Promise<AppNotification> {
      const response = await client.post<ApiSuccess<AppNotification>>(
        NOTIFICATION_ENDPOINTS.read(id),
        undefined,
        { signal },
      );
      return response.data;
    },

    async markAllAsRead(signal?: AbortSignal): Promise<string | null> {
      const response = await client.post<{ success: boolean; message?: string }>(
        NOTIFICATION_ENDPOINTS.markAllAsRead,
        undefined,
        { signal },
      );
      return response.message ?? null;
    },
  };
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;
