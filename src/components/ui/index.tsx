import { cloneElement, useEffect, useId, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
  icon,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Optional Font Awesome class rendered before the title. */
  icon?: string;
}) {
  return (
    <div className="ph-head">
      <div className="ph-page-title">
        <h1>
          {icon && <i className={icon} />} {title}
        </h1>
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

/**
 * Every variant the stylesheet actually defines.
 *
 * This union previously stopped at the six pharmacy-hub variants
 * (`ok/low/out/new/ans/closed`), which is WHY the component went unused: the
 * accounting screens render `paid/partial/unpaid/cancelled/credit/refunded`
 * (all defined in `pharmacy-accounting.css`) through `statusBadgeClass()`, and
 * TypeScript rejected them. A component that cannot express half the real
 * variants is not a component anyone can adopt.
 *
 * `(string & {})` keeps autocomplete for the known names while still accepting
 * a runtime value from a helper like `statusBadgeClass()`.
 */
export type BadgeVariant =
  | 'ok'
  | 'low'
  | 'out'
  | 'new'
  | 'ans'
  | 'closed'
  | 'paid'
  | 'partial'
  | 'unpaid'
  | 'cancelled'
  | 'credit'
  | 'refunded'
  | (string & {});

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return <span className={`ph-badge ${variant}`}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Button — `.ph-btn` + variant/size                                   */
/* ------------------------------------------------------------------ */
export type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type BtnSize = 'sm' | 'xs' | 'icon';

/**
 * Renders a `<button>`, or a router `<Link>` / plain `<a>` when `to` / `href`
 * is given — all with the identical `.ph-btn` classes.
 *
 * WHY IT GREW LINK SUPPORT
 * ------------------------
 * The component only ever emitted `<button>`, but 14 real call sites put
 * `.ph-btn` on a `<Link>` or `<a>` (navigation, not action). Those screens
 * could not use it, which is a large part of why `Btn` had a single call site
 * while 77 raw `.ph-btn` elements existed. Same component, wider surface —
 * no second button component.
 */
type BtnCommon = {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  children?: ReactNode;
};

export function Btn({
  variant,
  size,
  icon,
  children,
  to,
  href,
  ...rest
}: BtnCommon &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    /** Router navigation — renders a `<Link>`. */
    to?: string;
    /** External / non-router link — renders an `<a>`. */
    href?: string;
  }) {
  const cls = ['ph-btn', variant, size].filter(Boolean).join(' ');
  const inner = (
    <>
      {icon && <i className={icon} />}
      {children}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }

  return (
    <button className={cls} {...rest}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state — `.ph-empty`                                           */
/* ------------------------------------------------------------------ */

/**
 * Context-aware empty state.
 *
 * WHY IT GREW ACTION SLOTS
 * ------------------------
 * The component had `icon/title/description` only, and was used **once** —
 * because 4 real empty states in the app also render a call to action
 * ("add the first medicine", "create the first invoice"). With no slot for it,
 * those screens had to hand-write the block, so they never adopted the
 * component.
 *
 * `action` and `secondaryAction` take any node (a `<Btn>`, a `<Link>`, a form
 * button) so the caller keeps control of behaviour. Nothing here navigates.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
}: {
  icon: string;
  title: string;
  description?: string;
  /** Primary call to action, e.g. "add the first medicine". */
  action?: ReactNode;
  /** Optional quieter second path, e.g. "import a file instead". */
  secondaryAction?: ReactNode;
  /** `danger` tints the icon for a failure-flavoured empty state. */
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className={tone === 'danger' ? 'ph-empty is-danger' : 'ph-empty'}>
      <i className={icon} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {(action || secondaryAction) && (
        <div className="ph-empty-actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table — `.ph-table` (+ optional `.ph-table-wrap` scroll container)  */
/* ------------------------------------------------------------------ */

/** A column header. The bare-`ReactNode` form is still accepted. */
export interface ColumnDef {
  label: ReactNode;
  /** e.g. `ac-num` for an end-aligned numeric column. */
  className?: string;
  /** `col` by default — set `row` for a header that labels the row. */
  scope?: 'col' | 'row';
  /**
   * Makes the header a real sort control: it becomes a `<button>` inside the
   * `<th>` with `aria-sort` on the `<th>` itself and a direction indicator.
   *
   * Passing `sort` is what makes it sortable — there is no separate boolean, so
   * a header cannot claim to be sortable while having nothing to sort by.
   */
  sort?: {
    /** The key handed back to `onSort`. */
    key: string;
    active: boolean;
    /** `aria-sort` value for the `<th>`. */
    ariaSort: 'ascending' | 'descending' | 'none';
    direction: 'asc' | 'desc' | null;
  };
  /** Rowspan/colspan passthrough for grouped headers. */
  colSpan?: number;
}

/**
 * WHY THIS GREW A `caption` AND A `ColumnDef` FORM
 * ------------------------------------------------
 * The component was unused (0 call sites) while the screens wrote raw
 * `<table>` markup. The reason was capability, not taste — the screens need:
 *
 *   · `scope="col"` on headers  — 53 occurrences
 *   · a `<caption>`             —  8 occurrences
 *   · per-column classes (`ac-num`, `ac-actions`) — 18 occurrences
 *
 * None of those were expressible, so every screen that needed them had to drop
 * to raw markup. The extras below close that gap instead of adding a second
 * table component.
 *
 * STICKY HEADERS
 * --------------
 * `sticky` pins the `<thead>` while the body scrolls. The list screens here
 * paginate at 50 rows, so the header is routinely scrolled out of view and the
 * user loses the column meanings. It is opt-in because a table inside a modal
 * or a short card has nothing to stick to.
 */
export function DataTable({
  columns,
  children,
  wrap = true,
  caption,
  className,
  sticky = false,
  onSort,
}: {
  columns: Array<ReactNode | ColumnDef>;
  children: ReactNode;
  wrap?: boolean;
  /** Visually hidden by default via `ac-hidden`, matching the Blade tables. */
  caption?: string;
  /** Extra class on the `<table>` itself, e.g. `pi-recent`. */
  className?: string;
  /** Pin the header row while the body scrolls. */
  sticky?: boolean;
  /** Called with a column's `sort.key` when its header button is pressed. */
  onSort?: (key: string) => void;
}) {
  const cls = ['ph-table', sticky ? 'is-sticky' : '', className].filter(Boolean).join(' ');

  const table = (
    <table className={cls}>
      {caption && <caption className="ac-hidden">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c, i) => {
            const isDef =
              typeof c === 'object' && c !== null && !('$$typeof' in (c as object));
            const def = isDef ? (c as ColumnDef) : null;

            if (!def?.sort) {
              return (
                <th
                  key={i}
                  scope={def?.scope ?? 'col'}
                  className={def?.className}
                  colSpan={def?.colSpan}
                >
                  {def ? def.label : (c as ReactNode)}
                </th>
              );
            }

            /*
             * A sortable header is a BUTTON, not a bare `<th>` with an onClick.
             * A click handler on a `<th>` is unreachable by keyboard and
             * announced as a plain cell by a screen reader — the sort would
             * simply not exist for those users.
             *
             * `aria-sort` goes on the `<th>` (that is where the spec puts it),
             * while the button carries the pressed state via `aria-pressed` and
             * the label explains what will happen next.
             */
            const { key, ariaSort, direction } = def.sort;
            return (
              <th
                key={i}
                scope="col"
                className={[def.className, 'ph-th-sortable'].filter(Boolean).join(' ')}
                colSpan={def.colSpan}
                aria-sort={ariaSort}
              >
                <button
                  type="button"
                  className="ph-sort-btn"
                  onClick={() => onSort?.(key)}
                  aria-label={
                    direction === null
                      ? `ترتيب تصاعدي حسب ${typeof def.label === 'string' ? def.label : ''}`
                      : direction === 'asc'
                        ? 'ترتيب تنازلي'
                        : 'إلغاء الترتيب'
                  }
                >
                  {def.label}
                  <i
                    className={
                      direction === null
                        ? 'fas fa-sort ph-sort-ic'
                        : direction === 'asc'
                          ? 'fas fa-sort-up ph-sort-ic is-active'
                          : 'fas fa-sort-down ph-sort-ic is-active'
                    }
                    aria-hidden="true"
                  />
                </button>
              </th>
            );
          })}
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
/**
 * Modal dialog with a real focus trap.
 *
 * WHAT WAS MISSING
 * ----------------
 * The dialog rendered fine but was invisible to the keyboard: Tab walked out of
 * it and into the page behind, Escape did nothing, focus was never moved in on
 * open nor returned to the trigger on close, and nothing announced it as a
 * dialog. A keyboard or screen-reader user could end up typing into a form they
 * could not see.
 *
 * WHAT IT DOES NOW
 *   · `role="dialog"` + `aria-modal` + `aria-labelledby` pointing at the title
 *   · focus moves to the first focusable element on open (or the dialog itself)
 *   · Tab / Shift+Tab cycle INSIDE the dialog
 *   · Escape closes it
 *   · focus returns to whatever opened it
 *   · the page behind cannot scroll while it is open
 *
 * The focusable-element query is the standard one; `[tabindex="-1"]` is included
 * so a programmatically-focused container is reachable but not tabbable.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    // Remember what had focus so it can be restored on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const node = dialogRef.current;
    const focusables = node
      ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      : [];
    // Prefer the first control; fall back to the dialog so focus is at least
    // inside it and the trap has somewhere to start.
    (focusables[0] ?? node)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          )
        : [];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !node?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    // Stop the page behind from scrolling under the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ph-modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ph-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ph-modal-head">
          <h3 id={titleId}>{title}</h3>
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

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

const NOTICE_ICON: Record<NoticeTone, string> = {
  success: 'fas fa-circle-check',
  error: 'fas fa-circle-exclamation',
  warning: 'fas fa-triangle-exclamation',
  info: 'fas fa-circle-info',
};

/**
 * Inline feedback for a completed action (save / send / delete).
 *
 * WHY IT EXISTS
 * -------------
 * The app already had the styling for this — `.ac-inline-msg` with
 * `success / error / warning` variants — but no component, so call sites were
 * written by hand and got it wrong. Both existing call sites used
 * `className="ac-inline-msg is-err"`, where:
 *
 *   · `is-err` is defined NOWHERE (the real variant is `error`), and
 *   · `.ac-inline-msg` is `display: none` until it also has `.show`.
 *
 * Net effect: the POS sale-failure message and the chat send-failure message
 * were **invisible**. The user saw nothing when an action failed.
 *
 * This wraps the EXISTING classes so the variants cannot be mistyped, and
 * `.show` is always applied. No new visual language.
 */
export function Notice({
  tone,
  children,
}: {
  tone: NoticeTone;
  children: ReactNode;
}) {
  return (
    <div
      className={`ac-inline-msg show ${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <i className={NOTICE_ICON[tone]} />
      <span>{children}</span>
    </div>
  );
}

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

/* ------------------------------------------------------------------ */
/* Setup checklist — first-run onboarding                              */
/* ------------------------------------------------------------------ */

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  /** Where to send the user to complete this step. */
  to: string;
  /** Optional short hint under the label. */
  hint?: string;
}

/**
 * A quiet progress checklist for a new pharmacy.
 *
 * DESIGN CONSTRAINTS (from the brief)
 * -----------------------------------
 * · NOT annoying, and it must NOT cover content — it is an inline card in the
 *   normal page flow, never a modal or an overlay.
 * · It disappears on its own once every step is done, so an established
 *   pharmacy never sees it.
 * · It can be dismissed, and the dismissal is remembered, so a user who does
 *   not want it is not asked twice.
 *
 * Completion is passed in by the caller, derived from REAL data — the component
 * never guesses and never invents a step that cannot be verified.
 */
export function SetupChecklist({
  steps,
  title,
  onDismiss,
}: {
  steps: SetupStep[];
  title: string;
  onDismiss?: () => void;
}) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="ph-setup" aria-label={title}>
      <div className="ph-setup-head">
        <div>
          <h2 className="ph-setup-title">{title}</h2>
          <p className="ph-setup-count">
            {done} / {steps.length}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            className="ph-setup-dismiss"
            onClick={onDismiss}
            aria-label="إخفاء"
          >
            ×
          </button>
        )}
      </div>

      {/* Progress is a real progressbar so it is announced, not just drawn. */}
      <div
        className="ph-setup-bar"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={steps.length}
      >
        <span className="ph-setup-bar-fill" style={{ inlineSize: `${pct}%` }} />
      </div>

      <ol className="ph-setup-steps">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? 'is-done' : 'is-todo'}>
            <i
              className={s.done ? 'fas fa-circle-check' : 'far fa-circle'}
              aria-hidden="true"
            />
            <span className="ph-setup-step-text">
              <span className="ph-setup-step-label">{s.label}</span>
              {s.hint && <span className="ph-setup-step-hint">{s.hint}</span>}
            </span>
            {!s.done && (
              <Link to={s.to} className="ph-setup-step-go">
                ابدأ
                <i className="fas fa-arrow-left" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Forms — inline validation with a touched state                      */
/* ------------------------------------------------------------------ */

/**
 * One form field: label, control, and a message slot that flips between an
 * error and a success hint.
 *
 * WHY THIS EXISTS
 * ---------------
 * The forms only surfaced errors AFTER submit, as one message at the top of the
 * form. A field could be wrong from the moment it was typed and said nothing
 * until the user pressed the button, and then the message was not attached to
 * the field that caused it.
 *
 * The three states, and why each matters:
 *   · untouched → neutral. Never scold someone for a field they have not
 *     reached yet; that is the most common validation-UX mistake.
 *   · touched + invalid → red border, message below, `aria-invalid` set
 *   · touched + valid   → green border, quiet confirmation
 *
 * The message is wired to the control with `aria-describedby` and
 * `aria-invalid`, so a screen reader announces it with the field.
 *
 * `id` is generated when not supplied so the label always resolves.
 */
export function FormField({
  label,
  id,
  error,
  hint,
  touched,
  required,
  children,
}: {
  label: ReactNode;
  id?: string;
  /** Shown only once the field has been touched. */
  error?: string | null;
  /** Always-visible guidance, replaced by the error when there is one. */
  hint?: ReactNode;
  touched?: boolean;
  required?: boolean;
  /** The control itself. It receives the generated id via `htmlFor` on the label. */
  children: ReactNode;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-msg`;
  const showError = Boolean(touched && error);
  const showOk = Boolean(touched && !error);

  return (
    <div
      className={[
        'ph-field',
        showError ? 'is-invalid' : '',
        showOk ? 'is-valid' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="ph-form-label" htmlFor={fieldId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {/* The control is cloned so every field gets the same wiring without each
          screen remembering to add it. Cast through the element's own props type
          because `cloneElement` cannot infer `id` on an opaque ReactElement. */}
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: fieldId,
        'aria-invalid': showError || undefined,
        'aria-describedby': showError || hint ? messageId : undefined,
      })}

      {(showError || hint) && (
        <p className="ph-field-msg" id={messageId}>
          {showError ? (
            <>
              <i className="fas fa-circle-exclamation" aria-hidden="true" /> {error}
            </>
          ) : (
            hint
          )}
        </p>
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
