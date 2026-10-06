import type { ReactNode } from 'react';

/**
 * Shared pharmacy UI primitives — thin wrappers over the Blade `ph-*` classes.
 *
 * Each component emits the SAME class names the Blade templates emit, so
 * styles/pages/pharmacy-hub.css applies unchanged. No new visual values.
 */

/* ------------------------------------------------------------------ */
/* Page header — `.ph-head` + `.ph-page-title` + `.ph-actions`         */
/* ------------------------------------------------------------------ */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ph-head">
      <div className="ph-page-title">
        <h1>{title}</h1>
        {subtitle != null && <p>{subtitle}</p>}
      </div>
      {actions != null && <div className="ph-actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card — `.ph-stat` with a colour variant and a Font Awesome icon */
/* ------------------------------------------------------------------ */
export type StatTone = 'teal' | 'green' | 'orange' | 'red' | 'blue' | 'gray';

export function StatCard({
  tone,
  icon,
  value,
  label,
}: {
  tone: StatTone;
  icon: string;
  value: ReactNode;
  label: string;
}) {
  return (
    <div className="ph-stat">
      <i className={`${icon} ${tone}`} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card + head + body — `.ph-card` / `.ph-card-head` / `.ph-card-body`  */
/* ------------------------------------------------------------------ */
export function Card({
  title,
  icon,
  description,
  children,
  headExtra,
  bodyClassName,
  bodyStyle,
}: {
  title?: ReactNode;
  icon?: string;
  description?: ReactNode;
  children: ReactNode;
  headExtra?: ReactNode;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <div className="ph-card">
      {(title != null || headExtra != null) && (
        <div className="ph-card-head">
          {title != null && (
            <h2>
              {icon && <i className={icon} />} {title}
            </h2>
          )}
          {headExtra}
          {description != null && <p>{description}</p>}
        </div>
      )}
      <div className={bodyClassName ?? 'ph-card-body'} style={bodyStyle}>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge — `.ph-badge` + status variant                                */
/* ------------------------------------------------------------------ */
export type BadgeVariant = 'ok' | 'low' | 'out' | 'new' | 'ans' | 'closed';

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return <span className={`ph-badge ${variant}`}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Button — `.ph-btn` + variant/size                                   */
/* ------------------------------------------------------------------ */
export type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'xs' | 'icon';

export function Btn({
  variant,
  size,
  icon,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
}) {
  const cls = ['ph-btn', variant, size].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <i className={icon} />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — `.ph-empty`                                           */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="ph-empty">
      <i className={icon} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table — `.ph-table` (+ optional `.ph-table-wrap` scroll container)  */
/* ------------------------------------------------------------------ */
export function DataTable({
  columns,
  children,
  wrap = true,
}: {
  columns: ReactNode[];
  children: ReactNode;
  wrap?: boolean;
}) {
  const table = (
    <table className="ph-table">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
  return wrap ? <div className="ph-table-wrap">{table}</div> : table;
}

/* ------------------------------------------------------------------ */
/* Modal — `.ph-modal-overlay` / `.ph-modal`                           */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="ph-modal-overlay active" onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ph-modal">
        <div className="ph-modal-head">
          <h3>{title}</h3>
          <button className="ph-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="ph-modal-body">{children}</div>
        {footer && <div className="ph-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Async states — loading / error / empty, reused by every live screen  */
/* ------------------------------------------------------------------ */

/**
 * Loading skeleton.
 *
 * Renders `rows` shimmer bars using the pagination skeleton classes already in
 * `pharmacy-hub.css`. Deliberately NOT a spinner: a skeleton keeps the page
 * height stable, so the layout does not jump when data arrives.
 */
export function LoadingState({ rows = 4, label = 'جارٍ التحميل…' }: { rows?: number; label?: string }) {
  return (
    <div className="ph-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="ph-skel-stack">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="ph-skel-row" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error state with a retry affordance.
 *
 * `message` prefers the server's own Arabic message (Laravel localises errors)
 * and falls back to the client-side default for the `ApiError.kind`. It is
 * never re-translated here — see `errors.ts`.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'إعادة المحاولة',
  icon = 'fas fa-triangle-exclamation',
}: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: string;
}) {
  return (
    <div className="ph-error" role="alert">
      <i className={icon} />
      <h3>تعذّر تحميل البيانات</h3>
      {message && <p>{message}</p>}
      {onRetry && (
        <button className="ph-btn outline sm" onClick={onRetry} type="button">
          <i className="fas fa-rotate-right" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Render-prop gate: shows loading, error, or empty — otherwise the content.
 *
 * Keeping this in ONE place means every screen gets identical async behaviour,
 * and a screen can never accidentally render an empty table while still loading.
 */
export function AsyncBoundary({
  isLoading,
  isError,
  error,
  isEmpty,
  onRetry,
  emptyTitle = 'لا توجد بيانات',
  emptyDescription,
  emptyIcon = 'fas fa-inbox',
  loadingRows = 4,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: { message?: string } | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: string;
  loadingRows?: number;
  children: ReactNode;
}) {
  if (isLoading) return <LoadingState rows={loadingRows} />;
  if (isError) return <ErrorState message={error?.message} onRetry={onRetry} />;
  if (isEmpty) return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}
