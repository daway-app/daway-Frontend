/**
 * Notification shapes — verified against the backend `NotificationResource`.
 *
 * The backend emits `id`, `type`, `message`, `is_read`, `created_at`,
 * `medicine`, and (for order lifecycle events) `order_id` / `sub_order_id`.
 * Those two stay optional so older cached payloads remain valid.
 */

export type NotificationType =
  | 'order_created'
  | 'order_payment_receipt_submitted'
  | 'order_payment_approved'
  | 'order_payment_rejected'
  | 'order_payment_problem_reported'
  | 'order_payment_problem_resolved'
  | 'order_preparing'
  | 'order_ready'
  | 'order_rider_assigned'
  | 'order_rider_reassigned'
  | 'order_rider_unassigned'
  | 'order_picked_up'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'low_stock'
  | 'out_of_stock'
  | 'medicine_available'
  | 'new_inquiry'
  | 'inquiry_answered'
  | 'chat_message'
  | 'reminder'
  | (string & {});

export interface NotificationMedicine {
  id: number;
  trade_name: string | null;
}

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: string | null;
  medicine: NotificationMedicine | null;
  order_id?: number | null;
  sub_order_id?: number | null;
}

export interface NotificationPagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

/** Normalised list result — the envelope is unwrapped by `notificationsApi`. */
export interface NotificationList {
  notifications: AppNotification[];
  unreadCount: number;
  pagination: NotificationPagination;
}

export interface NotificationListQuery {
  page?: number;
  per_page?: number;
  type?: NotificationType;
}
