import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import {
  IconAlertTriangle,
  IconBell,
  IconBox,
  IconCart,
  IconChat,
} from '@/components/layout/icons';
import { useLang } from '@/lib/lang/useLang';
import type {
  AppNotification,
  NotificationList,
  NotificationListQuery,
} from '@/api/notificationTypes';
import type { NotificationsApi } from '@/api/notificationsApi';

export interface NotificationBellQueryKeys {
  all: QueryKey;
  list: (query?: NotificationListQuery) => QueryKey;
  count: QueryKey;
}

interface NotificationBellProps {
  /** Notifications API bound to the ACTIVE role's isolated client. */
  api: NotificationsApi;
  /** Identity-scoped keys for that same role. */
  queryKeys: NotificationBellQueryKeys;
  /** Optional safe route resolver. Return null when no detail route exists. */
  hrefFor?: (notification: AppNotification) => string | null;
  /** Optional real notifications index route. */
  viewAllHref?: string;
  buttonId?: string;
}

const AR_LOCALE = 'ar-EG-u-nu-latn';

function iconForType(type: string) {
  if (type.startsWith('order_')) return <IconCart size={18} />;
  if (type === 'low_stock' || type === 'out_of_stock' || type === 'medicine_available') {
    return <IconBox size={18} />;
  }
  if (type === 'new_inquiry' || type === 'inquiry_answered' || type === 'chat_message') {
    return <IconChat size={18} />;
  }
  if (type === 'reminder') return <IconAlertTriangle size={18} />;
  return <IconBell size={18} />;
}

function formatCreatedAt(value: string | null, lang: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? AR_LOCALE : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function applyReadState(
  list: NotificationList,
  updated: AppNotification,
  wasUnread: boolean,
): NotificationList {
  return {
    ...list,
    notifications: list.notifications.map((item) =>
      item.id === updated.id ? { ...item, ...updated, is_read: true } : item,
    ),
    unreadCount: wasUnread
      ? Math.max(0, list.unreadCount - 1)
      : list.unreadCount,
  };
}

/**
 * Real notification bell shared by the pharmacy and admin shells.
 *
 * The component owns presentation + cache behaviour only. Each shell passes
 * its OWN API instance and query keys, so the two sessions remain isolated.
 */
export function NotificationBell({
  api,
  queryKeys,
  hrefFor,
  viewAllHref,
  buttonId = 'notificationBtn',
}: NotificationBellProps) {
  const { lang, STR } = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listKey = useMemo(() => queryKeys.list({ page: 1 }), [queryKeys]);

  const countQuery = useQuery<number>({
    queryKey: queryKeys.count,
    queryFn: ({ signal }) => api.count(signal),
    staleTime: 20_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const listQuery = useQuery<NotificationList>({
    queryKey: listKey,
    queryFn: ({ signal }) => api.list({ page: 1 }, signal),
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  // A list response carries a fresher count than the poll; keep the badge in
  // sync without a second request.
  useEffect(() => {
    if (!listQuery.data) return;
    queryClient.setQueryData<number>(queryKeys.count, listQuery.data.unreadCount);
  }, [listQuery.data, queryClient, queryKeys.count]);

  useEffect(() => {
    if (!open) return;

    function onDocClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const markRead = useMutation({
    mutationFn: (notification: AppNotification) => api.markRead(notification.id),
    onSuccess: (updated, notification) => {
      setActionFailed(false);
      queryClient.setQueryData<NotificationList>(listKey, (current) =>
        current
          ? applyReadState(current, updated, !notification.is_read)
          : current,
      );
      queryClient.setQueryData<number>(queryKeys.count, (current) =>
        typeof current === 'number'
          ? Math.max(0, current - (notification.is_read ? 0 : 1))
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
    onError: () => setActionFailed(true),
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllAsRead(),
    onSuccess: () => {
      setActionFailed(false);
      queryClient.setQueryData<NotificationList>(listKey, (current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((notification) =>
                notification.is_read ? notification : { ...notification, is_read: true },
              ),
              unreadCount: 0,
            }
          : current,
      );
      queryClient.setQueryData<number>(queryKeys.count, 0);
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
    onError: () => setActionFailed(true),
  });

  async function handleSelect(notification: AppNotification) {
    setActionFailed(false);
    if (!notification.is_read) {
      try {
        await markRead.mutateAsync(notification);
      } catch {
        return;
      }
    }

    const href = hrefFor?.(notification) ?? null;
    if (href) {
      setOpen(false);
      navigate(href);
    }
  }

  const unreadCount = countQuery.data ?? 0;
  const notifications = listQuery.data?.notifications ?? [];
  const tooltip =
    unreadCount > 0
      ? `${STR.layout.notifications_tooltip} (${unreadCount})`
      : STR.layout.notifications_tooltip;

  return (
    <div className="notifications-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="icon-btn"
        id={buttonId}
        title={tooltip}
        aria-label={tooltip}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="notification-badge is-visible" aria-live="polite">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <div
        className={`notifications-dropdown${open ? ' active' : ''}`}
        role="dialog"
        aria-label={STR.layout.notifications_title}
      >
        <div className="notifications-header">
          <h3>{STR.layout.notifications_title}</h3>
          <button
            type="button"
            className="clear-all-btn"
            onClick={() => markAll.mutate()}
            disabled={unreadCount === 0 || markAll.isPending}
          >
            {STR.layout.mark_all_as_read}
          </button>
        </div>

        <div className="notifications-list">
          {open && listQuery.isPending ? (
            <p className="loading-notifications">{STR.layout.loading_notifications}</p>
          ) : listQuery.isError ? (
            <div className="notifications-state">
              <p className="error-notifications">{STR.layout.error_loading_notifications}</p>
              <button
                type="button"
                className="clear-all-btn"
                onClick={() => void listQuery.refetch()}
              >
                {STR.admin.common.retry}
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <p className="no-notifications">{STR.layout.no_new_notifications}</p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className={`notification-item${notification.is_read ? '' : ' unread'}`}
                onClick={() => void handleSelect(notification)}
                disabled={
                  markRead.isPending && markRead.variables?.id === notification.id
                }
              >
                <span className="notification-icon" aria-hidden="true">
                  {iconForType(notification.type)}
                </span>
                <span className="notification-content">
                  <span className="notification-title">{notification.message}</span>
                  {notification.created_at && (
                    <span className="notification-time">
                      {formatCreatedAt(notification.created_at, lang)}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}

          {actionFailed && (
            <p className="error-notifications">{STR.admin.common.error_hint}</p>
          )}
        </div>

        {viewAllHref && (
          <div className="notifications-footer">
            <Link to={viewAllHref} onClick={() => setOpen(false)}>
              {STR.layout.view_all_notifications}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

