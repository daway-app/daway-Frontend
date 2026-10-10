import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  Modal,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { num, pageInfo } from '../shared';
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
 */
export function AdminCategoriesPage() {
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [openCategory, setOpenCategory] = useState<AdminCategory | null>(null);

  const C = AR.admin.categories;

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
  );

  const rows = useMemo(() => query.data?.categories ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const stats = query.data?.stats;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const toggleMutation = useApiMutation(async (id: number) => api.admin.toggleCategory(id));

  async function handleToggle(category: AdminCategory) {
    try {
      await toggleMutation.run(category.id);
      toast.success(AR.admin.common.save);
      query.refetch();
    } catch {
      toast.error('تعذّر تحديث حالة القسم، حاول مرة أخرى.');
    }
  }

  return (
    <>
      <PageHeader title={C.title} subtitle={AR.admin.nav.categories} icon="fas fa-folder-tree" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard tone="blue" icon="fas fa-folder-tree" value={num(stats?.total)} label={C.stat_total} />
              <StatCard tone="green" icon="fas fa-circle-check" value={num(stats?.active)} label={C.stat_active} />
              <StatCard tone="teal" icon="fas fa-link" value={num(stats?.links)} label={C.stat_links} />
              <StatCard
                tone="orange"
                icon="fas fa-triangle-exclamation"
                value={num(stats?.needs_review)}
                label={C.stat_needs_review}
              />
            </div>

            <Card
              headExtra={
                <div className="admin-filters">
                  <input
                    type="search"
                    className="admin-search"
                    placeholder={AR.admin.common.search}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={AR.admin.common.search}
                  />
                </div>
              }
            >
              {rows.length === 0 ? (
                <div className="admin-empty">
                  <p>{C.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={C.title}
                  columns={[
                    { label: C.col_category },
                    { label: C.col_links, className: 'ac-num' },
                    { label: C.col_needs_review, className: 'ac-num' },
                    { label: C.col_sort, className: 'ac-num' },
                    { label: C.col_status },
                    { label: C.col_actions, className: 'ac-actions' },
                  ]}
                >
                  {rows.map((category) => (
                    <tr key={category.id}>
                      <td>
                        {category.name_ar}
                        {category.name_en && <span className="admin-sub"> — {category.name_en}</span>}
                      </td>
                      <td className="ac-num">{num(category.category_medicine_links_count)}</td>
                      <td className="ac-num">
                        {num(category.needs_review_count) > 0 ? (
                          <Badge variant="low">{num(category.needs_review_count)}</Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="ac-num">{category.sort_order ?? '—'}</td>
                      <td>
                        <Badge variant={category.is_active ? 'ok' : 'out'}>
                          {category.is_active ? C.status_active : C.status_inactive}
                        </Badge>
                      </td>
                      <td className="ac-actions">
                        <Btn
                          size="xs"
                          variant="outline"
                          disabled={toggleMutation.isPending}
                          onClick={() => handleToggle(category)}
                        >
                          {C.action_toggle}
                        </Btn>
                        <Btn size="xs" variant="primary" onClick={() => setOpenCategory(category)}>
                          {C.action_links}
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="admin-pagination">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {AR.admin.common.previous}
                  </Btn>
                  <span>{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {AR.admin.common.next}
                  </Btn>
                </div>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>

      <CategoryLinksModal
        category={openCategory}
        onClose={() => setOpenCategory(null)}
        onChanged={() => query.refetch()}
      />
    </>
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
  const api = useAdminApi();
  const [page, setPage] = useState(1);
  const [confirmDetach, setConfirmDetach] = useState<AdminCategoryLink | null>(null);

  const C = AR.admin.categories;

  const query = useApiQuery<AdminCategoryLinksResponse>(
    (signal) => api.admin.categoryLinks(category.id, { page, per_page: 50 }, signal),
    [category.id, page],
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
            {AR.admin.common.close}
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
            <div className="admin-empty">
              <p>{C.empty_links}</p>
            </div>
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
                      <Badge variant="low">{C.link_review}</Badge>
                    ) : (
                      <Badge variant="ok">{C.link_approved}</Badge>
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
                {AR.admin.common.previous}
              </Btn>
              <span>{info?.label}</span>
              <Btn
                size="sm"
                variant="outline"
                disabled={pagination.current_page >= pagination.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                {AR.admin.common.next}
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
              {AR.admin.common.cancel}
            </Btn>
            <Btn variant="danger" onClick={handleDetach} disabled={isPending}>
              {AR.admin.common.confirm}
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
