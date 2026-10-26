import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Btn, EmptyState, Modal } from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { num, pageInfo } from '../shared';
import { thumbUrl } from '@/lib/format';
import type {
  AdminCategoriesResponse,
  AdminCategory,
  AdminCategoryLink,
  AdminCategoryLinksResponse,
} from '@/api/adminTypes';

/**
 * Admin categories — the catalogue's classification tree, plus link review.
 *
 * ============================================================================
 * 🔴 THE `moh_*` RULE
 * ============================================================================
 * A category↔medicine link can point at either:
 *   · a LOCAL medicine  → `type: 'medicine'`, `medicine_id` set
 *   · a MOH catalogue row → `type: 'moh'`, identified by `moh_product_id` or
 *     `moh_drug_id`
 *
 * For the MOH case the link MUST be identified by `moh_product_id`/`moh_drug_id`
 * and **never** by `moh_medicines.id`. Those are different numbering spaces, and
 * detaching/approving with the wrong one either misses the row or hits an
 * unrelated one. This screen only ever passes back the link's own `id` as the
 * path parameter, and reads the MOH reference from the fields the API names
 * explicitly — it never infers an id from a display name.
 *
 * `needs_review` marks a link the classifier was unsure about (low confidence
 * from a name-based match). Approving clears the flag; detaching removes the
 * category from the medicine entirely. Both are irreversible from the UI, so
 * each is confirmed in the links modal.
 *
 * ============================================================================
 * 🔴 WHAT THE BLADE PAGE HAS THAT THIS ONE CANNOT
 * ============================================================================
 * The Blade `categories/index.blade.php` header carries three actions:
 * «فلاتر الأعراض» (classify), «مزامنة الكتالوج» (sync) and «إضافة قسم» (create),
 * and each table row has «إدارة الأدوية» / «تعديل» / «حذف».
 *
 * Those are **web (session + CSRF) routes only** — `routes/web.php` serves
 * `Route::resource('categories', …)` plus `categories.classify` and
 * `categories.sync`, and `routes/api.php` exposes NONE of them. The API offers
 * exactly four category operations: list, toggle-status, links, and
 * approve/detach a link.
 *
 * So this screen renders the Blade **design** but only the actions the API
 * actually supports. It does not guess an endpoint, and it does not fake a
 * button that would 404 — a dead button is worse than an absent one. Porting
 * classify/sync would require a genuine API contract change, which is a
 * separate, deliberate decision.
 */

/** The Blade status pill carries a leading filled dot (`● مفعّل`). */
function StatusPill({ active, disabled, onClick, title }: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  const { STR } = useLang();
  const C = STR.admin.categories;
  return (
    <button
      type="button"
      className={`pill-badge status-badge ${active ? 'available' : 'out'}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      ● {active ? C.status_active : C.status_inactive}
    </button>
  );
}

export function AdminCategoriesPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Blade's needs-review stat card links to `?q=` — a full page reload that
   * clears the search box. The equivalent here is to READ that parameter, so
   * the card's link actually lands somewhere instead of navigating to a page
   * that ignores it. `?q=` with an empty value is a real state (it means
   * "clear the filter"), which is why the presence of the key is checked
   * rather than the truthiness of its value.
   */
  const seeded = searchParams.get('q');

  const [q, setQ] = useState(seeded ?? '');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState(seeded ?? '');
  const [openCategory, setOpenCategory] = useState<AdminCategory | null>(null);

  const C = STR.admin.categories;

  /** True while a keystroke is still waiting out the debounce — drives the
   *  Blade page's inline «بحث...» spinner. */
  const isDebouncing = q !== debouncedQ;

  /*
   * The needs-review card is a `<Link to="…/categories?q=">`. Clicking it while
   * already on this page does NOT remount the component, so `useState(seeded)`
   * alone would never see the new parameter and the click would do nothing —
   * the exact dead-control failure this port is trying to avoid. Watching the
   * parameter and clearing the box keeps the link honest in both cases.
   *
   * Clearing the box (rather than filling it) is deliberately the behaviour: it
   * shows the full list, which is where a reviewer wants to start.
   */
  useEffect(() => {
    if (seeded === null) return;
    setQ(seeded);
    setDebouncedQ(seeded);
    setPage(1);
  }, [seeded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminCategoriesResponse>(
    (signal) => api.admin.categories({ q: debouncedQ, page, per_page: 50 }, signal),
    [debouncedQ, page],
    { queryKey: keys.categories.list({ q: debouncedQ, page, per_page: 50 }) },
  );

  const rows = useMemo(() => query.data?.categories ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const stats = query.data?.stats;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  /** The recovery action only appears when a filter is actually responsible for
   *  the empty list. */
  const isFiltered = debouncedQ.trim() !== '';
  function clearFilters() {
    setQ('');
    setDebouncedQ('');
    setPage(1);
    // Drop `?q=` too — otherwise a reload would re-seed the filter that was
    // just cleared, and the URL would contradict the screen.
    setSearchParams({}, { replace: true });
  }

  /** The 4th stat card jumps to `?q=` when something needs review. Keep it a
   *  real link: `setSearchParams` is not used, so the card can be opened in a
   *  new tab like any other anchor. */
  const needsReview = num(stats?.needs_review);

  const toggleMutation = useApiMutation(async (id: number) => api.admin.toggleCategory(id));

  async function handleToggle(category: AdminCategory) {
    try {
      await toggleMutation.run(category.id);
      toast.success(STR.admin.common.save);
      query.refetch();
    } catch {
      toast.error('تعذّر تحديث حالة القسم، حاول مرة أخرى.');
    }
  }

  /**
   * The 4th stat card is a LINK when something needs review, matching Blade's
   * `?q=` jump. Blade's jump is a server-side reload of the same page; here it
   * navigates to `?q=`, which the page reads above and uses to seed the box.
   */
  const reviewHref = needsReview > 0 ? `${ADMIN_ROUTES.categories}?q=` : undefined;

  return (
    <div className="admin-page animated-page">
      {/* 1. Top header — title + description. Blade's three heavy actions
             (classify / sync / create) are web-only routes and are deliberately
             absent; see the module header. */}
      <div className="top-header-bar">
        <div className="header-title-section">
          <h1>{C.main_heading}</h1>
          <p>{C.main_description}</p>
        </div>
      </div>

      {/* 2. Breadcrumb trail */}
      <nav className="breadcrumb-trail" aria-label="مسار التنقل">
        <Link to={ADMIN_ROUTES.dashboard}>{C.breadcrumb_main}</Link>
        <span aria-hidden="true">‹</span>
        <span>{C.breadcrumb_current}</span>
      </nav>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            {/* 3. Stats — four cards, the last one a link once a count is
                   non-zero. */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-title">{C.stat_total}</span>
                <span className="stat-value total">{num(stats?.total)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">{C.stat_active}</span>
                <span className="stat-value available">{num(stats?.active)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">{C.stat_links}</span>
                <span className="stat-value low">{num(stats?.links)}</span>
              </div>
              {reviewHref ? (
                <Link
                  to={reviewHref}
                  className="stat-card stat-card-link stat-card-danger"
                >
                  <span className="stat-title">{C.stat_needs_review}</span>
                  <span className="stat-value danger">{needsReview}</span>
                </Link>
              ) : (
                <div className="stat-card">
                  <span className="stat-title">{C.stat_needs_review}</span>
                  <span className="stat-value low">{needsReview}</span>
                </div>
              )}
            </div>

            {/* 4. Search card (debounced) */}
            <div className="filter-card">
              <div className="filter-row">
                <input
                  type="search"
                  className="filter-input"
                  placeholder={C.search_placeholder}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={C.search_placeholder}
                  autoComplete="off"
                />
                {isDebouncing && (
                  <span className="filter-spinner" role="status">
                    {C.searching}
                  </span>
                )}
              </div>
            </div>

            {/* 5. Table card */}
            <div className="main-card">
              <div className="card-top-bar">
                <h3>{C.main_heading}</h3>
                <span>{num(pagination?.total)}</span>
              </div>

              {rows.length === 0 ? (
                <div className="table-empty-cell">
                  <EmptyState
                    icon="fas fa-layer-group"
                    title={C.empty}
                    description={isFiltered ? STR.admin.common.empty_filtered_hint : C.empty_hint}
                    action={
                      isFiltered ? (
                        <Btn size="sm" variant="outline" onClick={clearFilters}>
                          <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
                          {STR.admin.common.clear_filters}
                        </Btn>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th scope="col" className="ac-thumb">
                        {C.col_image}
                      </th>
                      <th scope="col">{C.col_category}</th>
                      <th scope="col">{C.col_status}</th>
                      <th scope="col">{C.col_sort}</th>
                      <th scope="col">{C.col_medicines_count}</th>
                      <th scope="col">{C.col_needs_review}</th>
                      <th scope="col" style={{ textAlign: 'center' }}>
                        {C.col_actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((category) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        busy={toggleMutation.isPending}
                        onToggle={() => handleToggle(category)}
                        onManageLinks={() => setOpenCategory(category)}
                      />
                    ))}
                  </tbody>
                </table>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="pagination-wrapper">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {STR.admin.common.previous}
                  </Btn>
                  <span className="page-meta">{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {STR.admin.common.next}
                  </Btn>
                </div>
              )}
            </div>
          </>
        )}
      </AsyncBoundary>

      <CategoryLinksModal
        category={openCategory}
        onClose={() => setOpenCategory(null)}
        onChanged={() => query.refetch()}
      />
    </div>
  );
}

/**
 * One row, matching `categories/_row.blade.php`.
 *
 * The Blade row offers three actions; only «إدارة الأدوية» has an API behind it.
 * The status pill is itself the toggle — that is the API's `toggle-status`
 * endpoint, and putting it on the pill keeps the Blade look while keeping the
 * one supported mutation reachable.
 */
function CategoryRow({
  category,
  busy,
  onToggle,
  onManageLinks,
}: {
  category: AdminCategory;
  busy: boolean;
  onToggle: () => void;
  onManageLinks: () => void;
}) {
  const { STR } = useLang();
  const C = STR.admin.categories;
  const reviewCount = num(category.needs_review_count);
  const linkCount = num(category.category_medicine_links_count);
  // Blade: `Image::thumbUrl($category->image, 84, 84)` displayed at 42×42. The
  // API returns the RAW stored path, so the Cloudinary size transform is applied
  // client-side — without it a 42px tile would pull a full-resolution image.
  const image = thumbUrl(category.image, 84, 84);

  return (
    <tr>
      {/* Dedicated image column — the category photo when set, else a grid icon
          in a cyan tile. Kept separate from the name column so a missing image
          leaves a clean empty slot rather than shifting the text. */}
      <td className="ac-thumb">
        {image ? (
          <img
            src={image}
            alt={category.name_ar}
            className="cat-cell__img"
            width={42}
            height={42}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="pill-icon-wrapper icon-cyan" aria-hidden="true">
            <i className="fas fa-table-cells-large" />
          </span>
        )}
      </td>

      <td>
        <div className="cat-cell__body">
          <strong className="cat-cell__name">{category.name_ar}</strong>
          <br />
          <small className="cat-cell__meta">
            {[category.name_en, category.slug].filter(Boolean).join(' • ') || '—'}
          </small>
          {category.subcategories != null && category.subcategories.length > 0 && (
            <div className="cat-cell__chips">
              {category.subcategories.map((sub) => (
                <span className="cat-chip" key={sub.id}>
                  {sub.name_ar}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      <td>
        <StatusPill
          active={category.is_active}
          disabled={busy}
          onClick={onToggle}
          title={C.action_toggle}
        />
      </td>

      <td>{category.sort_order ?? '—'}</td>

      <td>
        <strong className="cell-count">{linkCount}</strong>
      </td>

      <td>
        {reviewCount > 0 ? (
          <button
            type="button"
            className="pill-badge status-badge out"
            onClick={onManageLinks}
            title={C.tooltip_review}
          >
            ● {reviewCount}
          </button>
        ) : (
          <span className="cell-empty">—</span>
        )}
      </td>

      <td>
        <div className="action-btn-group">
          <button
            type="button"
            className="action-btn view"
            onClick={onManageLinks}
            title={C.tooltip_manage}
            aria-label={C.tooltip_manage}
          >
            <i className="fas fa-eye" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * The links modal for one category.
 *
 * Mounted only while a category is open (`category !== null`), so the query
 * inside runs on open and is torn down on close — no stale request for a
 * category the user already left, and no "enabled" flag to keep in sync.
 */
function CategoryLinksModal({
  category,
  onClose,
  onChanged,
}: {
  category: AdminCategory | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  if (category === null) return null;
  return <CategoryLinksModalInner category={category} onClose={onClose} onChanged={onChanged} />;
}

function CategoryLinksModalInner({
  category,
  onClose,
  onChanged,
}: {
  category: AdminCategory;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const [page, setPage] = useState(1);
  const [confirmDetach, setConfirmDetach] = useState<AdminCategoryLink | null>(null);

  const C = STR.admin.categories;

  const query = useApiQuery<AdminCategoryLinksResponse>(
    (signal) => api.admin.categoryLinks(category.id, { page, per_page: 50 }, signal),
    [category.id, page],
    { queryKey: keys.categories.links(category.id, { page, per_page: 50 }) },
  );

  const links = useMemo(() => query.data?.links ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const approveMutation = useApiMutation(async (linkId: number) =>
    api.admin.approveCategoryLink(category.id, linkId),
  );
  const detachMutation = useApiMutation(async (linkId: number) =>
    api.admin.detachCategoryLink(category.id, linkId),
  );

  async function handleApprove(link: AdminCategoryLink) {
    try {
      await approveMutation.run(link.id);
      toast.success(C.link_approved_msg);
      query.refetch();
      onChanged();
    } catch {
      toast.error('تعذّر اعتماد الربط، حاول مرة أخرى.');
    }
  }

  async function handleDetach() {
    if (!confirmDetach) return;
    const link = confirmDetach;
    setConfirmDetach(null);
    try {
      await detachMutation.run(link.id);
      toast.success(C.link_detached_msg);
      query.refetch();
      onChanged();
    } catch {
      toast.error('تعذّر إزالة الدواء، حاول مرة أخرى.');
    }
  }

  const isPending = approveMutation.isPending || detachMutation.isPending;

  return (
    <>
      <Modal
        open
        title={`${C.links_title} — ${category.name_ar}`}
        onClose={onClose}
        footer={
          <Btn variant="outline" onClick={onClose}>
            {STR.admin.common.close}
          </Btn>
        }
      >
        <AsyncBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={query.refetch}
          loadingRows={3}
        >
          {links.length === 0 ? (
            <EmptyState
              icon="fas fa-link-slash"
              title={C.empty_links}
              description={C.empty_links_hint}
            />
          ) : (
            <ul className="admin-detail-list">
              {links.map((link) => (
                <li key={link.id}>
                  <div>
                    {/* Name first; the machine identifiers stay secondary so a
                        reviewer reads the medicine, not a number. */}
                    <strong>{link.name ?? '—'}</strong>
                    <span className="admin-muted">
                      {link.type === 'moh' ? C.link_type_moh : C.link_type_local}
                      {link.type === 'moh' && (
                        <>
                          {' · '}
                          {link.moh_product_id != null && (
                            <span dir="ltr">product #{link.moh_product_id}</span>
                          )}
                          {link.moh_drug_id != null && (
                            <span dir="ltr"> drug #{link.moh_drug_id}</span>
                          )}
                        </>
                      )}
                      {link.confidence != null && (
                        <span dir="ltr"> · {Math.round(link.confidence * 100)}%</span>
                      )}
                    </span>
                  </div>
                  <div className="admin-detail-list__actions">
                    {link.needs_review ? (
                      <span className="pill-badge status-badge out">{C.link_review}</span>
                    ) : (
                      <span className="pill-badge status-badge available">{C.link_approved}</span>
                    )}
                    {link.needs_review && (
                      <Btn
                        size="xs"
                        variant="primary"
                        disabled={isPending}
                        onClick={() => handleApprove(link)}
                      >
                        {C.link_approve}
                      </Btn>
                    )}
                    <Btn
                      size="xs"
                      variant="danger"
                      disabled={isPending}
                      onClick={() => setConfirmDetach(link)}
                    >
                      {C.link_detach}
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pagination && pagination.last_page > 1 && (
            <div className="admin-pagination">
              <Btn
                size="sm"
                variant="outline"
                disabled={pagination.current_page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {STR.admin.common.previous}
              </Btn>
              <span>{info?.label}</span>
              <Btn
                size="sm"
                variant="outline"
                disabled={pagination.current_page >= pagination.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                {STR.admin.common.next}
              </Btn>
            </div>
          )}
        </AsyncBoundary>
      </Modal>

      {/* Detach is destructive and not undoable from here — confirm it. */}
      <Modal
        open={confirmDetach !== null}
        title={C.link_detach}
        onClose={() => setConfirmDetach(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmDetach(null)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn variant="danger" onClick={handleDetach} disabled={isPending}>
              {STR.admin.common.confirm}
            </Btn>
          </>
        }
      >
        <p>سيتم إزالة هذا الدواء من القسم. يمكن إعادة ربطه لاحقاً إن لزم.</p>
        {confirmDetach && <strong>{confirmDetach.name ?? '—'}</strong>}
      </Modal>
    </>
  );
}

