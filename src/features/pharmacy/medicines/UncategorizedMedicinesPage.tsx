import { useMemo, useState } from 'react';
import { useLang } from '@/lib/lang/LanguageContext';
import { useUrlState } from '@/lib/urlState';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { AsyncBoundary, Btn, EmptyState, PageHeader } from '@/components/ui';
import { publicKeys } from '@/api/queryKeys';
import { toast } from '@/lib/toast';
import { thumbUrl } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import type {
  ApiCategory,
  ApiUncategorizedList,
  ApiUncategorizedMedicine,
} from '@/api/pharmacyTypes';

const PER_PAGE = 12;

interface RowChoice {
  categoryId: string;
  subcategoryId: string;
}

const EMPTY_CHOICE: RowChoice = { categoryId: '', subcategoryId: '' };

function categoryLabel(category: ApiCategory, lang: string): string {
  if (lang === 'ar') return category.name_ar || category.name_en || String(category.id);
  return category.name_en || category.name_ar || String(category.id);
}

export function UncategorizedMedicinesPage() {
  const { lang, STR } = useLang();
  const D = STR.pharmacy.medicines.uncategorized;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();

  const { state, set } = useUrlState({
    q: { key: 'q', parse: String, serialize: String, default: '' },
    page: {
      key: 'page',
      parse: (raw) => Number(raw) || 1,
      serialize: String,
      default: 1,
    },
  });

  const q = state.q as string;
  const page = Math.max(1, state.page as number);
  const [draft, setDraft] = useState(q);

  const categoriesQuery = useApiQuery<ApiCategory[]>(
    (signal) => api.categories(signal),
    [],
    { queryKey: publicKeys.categories },
  );

  const categories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => category.is_active !== false),
    [categoriesQuery.data],
  );

  const query = useApiQuery<ApiUncategorizedList>(
    (signal) => api.uncategorizedMedicines({ q, page, per_page: PER_PAGE }, signal),
    [q, page],
    { queryKey: keys.medicines.uncategorized({ q, page, per_page: PER_PAGE }) },
  );

  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(() => new Set());

  const serverRows = useMemo(() => query.data?.data ?? [], [query.data]);

  /** Removed ids that the server response has not caught up with yet. */
  const rows = useMemo(
    () => serverRows.filter((row) => !removed.has(row.id)),
    [serverRows, removed],
  );
  const total = Math.max(
    0,
    (query.data?.pagination.total ?? 0) -
      serverRows.filter((row) => removed.has(row.id)).length,
  );
  const lastPage = Math.max(1, query.data?.pagination.last_page ?? 1);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  function choiceFor(id: number): RowChoice {
    return choices[id] ?? EMPTY_CHOICE;
  }

  function updateChoice(id: number, patch: Partial<RowChoice>) {
    setChoices((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_CHOICE), ...patch },
    }));
  }

  function subcategoriesOf(categoryId: string): ApiCategory[] {
    const category = categoryById.get(Number(categoryId));
    if (!category || !Array.isArray(category.subcategories)) return [];
    return category.subcategories.filter((sub) => sub.is_active !== false);
  }

  const assign = useApiMutation(
    (id: number, body: { category_id: number; subcategory_id?: number }) =>
      api.assignMedicineCategory(id, body),
    { invalidates: [keys.medicines.uncategorizedAll] },
  );

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    set({ q: draft.trim(), page: 1 });
  }

  async function handleSave(row: ApiUncategorizedMedicine) {
    const choice = choiceFor(row.id);
    if (choice.categoryId === '') return;

    const body: { category_id: number; subcategory_id?: number } = {
      category_id: Number(choice.categoryId),
    };
    if (choice.subcategoryId !== '') {
      body.subcategory_id = Number(choice.subcategoryId);
    }

    setSavingIds((prev) => new Set(prev).add(row.id));
    try {
      await assign.run(row.id, body);
      setRemoved((prev) => new Set(prev).add(row.id));
      toast.success(D.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : D.save_error);
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  const isEmpty = rows.length === 0;
  const allCategorized = total === 0 && (q === '' || removed.size > 0);
  const emptyTitle =
    allCategorized && removed.size > 0 ? D.all_done : D.empty_title;

  return (
    <div className="ph-page">
      <PageHeader
        title={D.title}
        subtitle={D.subtitle}
        actions={
          <Btn to={ROUTES.medicines} variant="ghost" icon="fas fa-arrow-right">
            {D.back}
          </Btn>
        }
      />

      <AsyncBoundary
        isLoading={query.isLoading || categoriesQuery.isLoading}
        isError={query.isError || categoriesQuery.isError}
        error={query.error ?? categoriesQuery.error}
        onRetry={() => {
          query.refetch();
          categoriesQuery.refetch();
        }}
        loadingRows={4}
      >
        <form className="ph-filters" onSubmit={submitSearch}>
          <div className="ph-search">
            <i className="fas fa-search" />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={D.search_placeholder}
              autoComplete="off"
              name="q"
            />
          </div>
          <button type="submit" className="ph-btn outline">
            <i className="fas fa-search" /> {D.search}
          </button>
        </form>

        {isEmpty ? (
          <EmptyState
            icon={allCategorized ? 'fas fa-circle-check' : 'fas fa-magnifying-glass'}
            title={emptyTitle}
            description={allCategorized ? D.empty_desc : undefined}
          />
        ) : (
          <div className="ph-grid">
              {rows.map((row) => {
                const choice = choiceFor(row.id);
                const subcategories = subcategoriesOf(choice.categoryId);
                const primary = row.trade_name_ar || row.trade_name || '—';
                const latin = row.trade_name_ar && row.trade_name ? row.trade_name : null;
                const image = thumbUrl(row.image_url, 88, 88);
                const saving = savingIds.has(row.id);

                return (
                  <article key={row.id} className="ph-card ph-uncat-card">
                    <div className="ph-card-body">
                      <div className="ph-uncat-head">
                        <div className="ph-med-thumb">
                          {image ? (
                            <img
                              src={image}
                              alt={primary}
                              width={44}
                              height={44}
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <i className="fas fa-pills" />
                          )}
                        </div>
                        <div className="ph-uncat-names">
                          <h2>{primary}</h2>
                          {latin && (
                            <span className="ph-uncat-latin" dir="ltr">
                              {latin}
                            </span>
                          )}
                          {row.active_ingredient && (
                            <p className="ph-uncat-ingredient">{row.active_ingredient}</p>
                          )}
                        </div>
                      </div>

                      <p
                        className={
                          row.description
                            ? 'ph-uncat-desc'
                            : 'ph-uncat-desc is-empty'
                        }
                      >
                        {row.description || D.description_empty}
                      </p>

                      <div className="ph-uncat-form">
                        <div className="ph-field">
                          <label
                            className="ph-form-label"
                            htmlFor={`uncat-category-${row.id}`}
                          >
                            {D.category}
                            <span aria-hidden="true"> *</span>
                          </label>
                          <select
                            id={`uncat-category-${row.id}`}
                            className="fc"
                            value={choice.categoryId}
                            required
                            disabled={saving}
                            onChange={(e) =>
                              updateChoice(row.id, {
                                categoryId: e.target.value,
                                subcategoryId: '',
                              })
                            }
                          >
                            <option value="">{D.category_placeholder}</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {categoryLabel(category, lang)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {subcategories.length > 0 && (
                          <div className="ph-field">
                            <label
                              className="ph-form-label"
                              htmlFor={`uncat-subcategory-${row.id}`}
                            >
                              {D.subcategory}
                            </label>
                            <select
                              id={`uncat-subcategory-${row.id}`}
                              className="fc"
                              value={choice.subcategoryId}
                              disabled={saving}
                              onChange={(e) =>
                                updateChoice(row.id, {
                                  subcategoryId: e.target.value,
                                })
                              }
                            >
                              <option value="">{D.subcategory_placeholder}</option>
                              {subcategories.map((subcategory) => (
                                <option key={subcategory.id} value={subcategory.id}>
                                  {categoryLabel(subcategory, lang)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <Btn
                          type="button"
                          variant="primary"
                          icon={saving ? 'fas fa-spinner fa-spin' : 'fas fa-tags'}
                          disabled={choice.categoryId === '' || saving}
                          onClick={() => void handleSave(row)}
                        >
                          {saving ? D.saving : D.save}
                        </Btn>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        )}

        {lastPage > 1 && (
          <div
            className="ac-pagination"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <button
              type="button"
              className="ph-btn ghost sm"
              disabled={page <= 1}
              onClick={() => set({ page: Math.max(1, page - 1) })}
            >
              <i className="fas fa-chevron-right" aria-hidden="true" /> {D.prev}
            </button>
            <span className="ac-muted">
              {page} / {lastPage}
            </span>
            <button
              type="button"
              className="ph-btn ghost sm"
              disabled={page >= lastPage}
              onClick={() => set({ page: Math.min(lastPage, page + 1) })}
            >
              {D.next} <i className="fas fa-chevron-left" aria-hidden="true" />
            </button>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
