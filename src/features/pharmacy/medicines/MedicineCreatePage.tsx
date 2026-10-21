import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { publicKeys } from '@/api/queryKeys';
import type { ApiCategory } from '@/api/pharmacyTypes';
import { AsyncBoundary, Btn, FormField, Notice, PageHeader } from '@/components/ui';
import { useLang } from '@/lib/lang/LanguageContext';
import { ROUTES } from '@/routes/paths';
import { stockStatus } from '@/lib/stock';
import { money, thumbUrl } from '@/lib/format';
import { ApiError } from '@/api/errors';

interface CatalogOption {
  key: string;
  kind: 'medicine' | 'moh';
  id: number;
  name: string;
  nameAr: string | null;
  sub: string | null;
  officialPrice: number | null;
}

const ARABIC_RE = /[؀-ۿ]/;

export function MedicineCreatePage() {
  const { STR } = useLang();
  const C = STR.pharmacy.medicines.create;
  const I = STR.pharmacy.medicines.index;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const { user } = useAuth();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<CatalogOption | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(term.trim()), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term]);

  const [results, setResults] = useState<CatalogOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    if (selected) return;
    if (debounced.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(false);
    void api
      .searchCatalog(debounced)
      .then((res) => {
        if (cancelled) return;
        const flat: CatalogOption[] = [
          ...(res.medicines ?? []).map((m) => ({
            key: `medicine-${m.id}`,
            kind: 'medicine' as const,
            id: m.id,
            name: m.name ?? '',
            nameAr: m.name_ar ?? null,
            sub: m.sub ?? null,
            officialPrice: null,
          })),
          ...(res.moh_catalog ?? []).map((m) => ({
            key: `moh-${m.id}`,
            kind: 'moh' as const,
            id: m.id,
            name: m.name ?? '',
            nameAr: null,
            sub: m.sub ?? null,
            officialPrice: m.official_price ?? null,
          })),
        ];
        setResults(flat);
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setSearchError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, debounced, selected]);

  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageBroken, setImageBroken] = useState(false);
  const [touched, setTouched] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [doneName, setDoneName] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const categories = useApiQuery<ApiCategory[]>((s) => api.categories(s), [], {
    enabled: !selected,
    queryKey: publicKeys.categories,
  });
  const categoryOptions = useMemo(() => categories.data ?? [], [categories.data]);
  const afterAdd = [
    keys.inventory.list({ per_page: 100 }),
    keys.dashboardStats,
    keys.sidebarCounts,
  ];
  const save = useApiMutation((b: Record<string, unknown>) => api.addMedicine(b), {
    invalidates: afterAdd,
  });
  const saveByName = useApiMutation((b: Record<string, unknown>) => api.addMedicineByName(b), {
    invalidates: afterAdd,
  });

  function pick(option: CatalogOption) {
    setSelected(option);
    setResults([]);
    setDebounced('');
    setSearchError(false);
    setTerm(option.name);
    setTouched(false);
    setDoneName(null);
    setTradeName(option.name);
    setTradeNameAr(option.nameAr ?? '');
    setIngredient(option.sub ?? '');
    if (option.officialPrice != null && price.trim() === '') {
      setPrice(String(option.officialPrice));
    }
  }

  function clearSelection() {
    setSelected(null);
    setTerm('');
    setDebounced('');
    setResults([]);
    setSearchError(false);
    setDoneName(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function resetForm() {
    setSelected(null);
    setTerm('');
    setDebounced('');
    setResults([]);
    setSearchError(false);
    setPrice('');
    setQuantity('');
    setImageUrl('');
    setImageBroken(false);
    setTouched(false);
    setTradeName('');
    setTradeNameAr('');
    setIngredient('');
    setBarcode('');
    setCategoryId('');
  }

  const priceNum = Number(price);
  const qtyNum = Number(quantity);
  const priceValid = price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0;
  const qtyValid = quantity.trim() !== '' && Number.isInteger(qtyNum) && qtyNum >= 0;
  const priceInvalid = touched && !priceValid;
  const qtyInvalid = touched && !qtyValid;
  const previewQty = qtyValid ? qtyNum : null;
  const previewStatus = previewQty == null ? null : stockStatus(previewQty);
  const previewLabel =
    previewStatus == null
      ? null
      : previewStatus === 'ok'
        ? C.status_available
        : previewStatus === 'low'
          ? C.status_low
          : C.status_out;
  const previewClass =
    previewStatus === 'ok' ? 'is-available' : previewStatus ? `is-${previewStatus}` : '';
  const hasArabicInLatin = !selected && ARABIC_RE.test(tradeName);
  const arNeedsArabic = !selected && tradeNameAr.trim() !== '' && !ARABIC_RE.test(tradeNameAr);
  const manualInvalid =
    !selected &&
    (tradeName.trim() === '' ||
      hasArabicInLatin ||
      arNeedsArabic ||
      ingredient.trim() === '' ||
      categoryId === '');
  const displayName = selected ? selected.name : tradeName.trim();
  const imageSrc = imageUrl.trim()
    ? (thumbUrl(imageUrl.trim(), 120, 120) ?? imageUrl.trim())
    : null;
  const isSaving = save.isPending || saveByName.isPending;
  const summarySource = selected
    ? selected.kind === 'moh'
      ? C.badge_moh
      : C.badge_local
    : C.manual_title;
  const showResults = !selected && !searching && !searchError && debounced.length >= 2;
  const serverError = save.error ?? saveByName.error;
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    const merge = (err: ApiError | null) => {
      if (err?.kind !== 'validation' || !err.errors) return;
      for (const [key, value] of Object.entries(err.errors)) {
        if (!(key in out)) out[key] = value.join(' ');
      }
    };
    merge(save.error);
    merge(saveByName.error);
    return out;
  }, [save.error, saveByName.error]);

  function finish(name: string) {
    setDoneName(name);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setDoneName(null);
    if (!priceValid || !qtyValid) return;
    if (selected) {
      try {
        const image = imageUrl.trim();
        await save.run({
          ...(selected.kind === 'medicine'
            ? { medicine_id: selected.id }
            : { moh_medicine_id: selected.id }),
          price: priceNum,
          quantity: qtyNum,
          is_available: qtyNum > 0,
          ...(image ? { image_url: image } : {}),
        });
        const name = selected.name || C.title;
        resetForm();
        finish(name);
      } catch {
        return;
      }
      return;
    }
    if (manualInvalid) return;
    try {
      const image = imageUrl.trim();
      await saveByName.run({
        trade_name: tradeName.trim(),
        ...(tradeNameAr.trim() ? { trade_name_ar: tradeNameAr.trim() } : {}),
        active_ingredient: ingredient.trim(),
        price: priceNum,
        quantity: qtyNum,
        is_available: qtyNum > 0,
        category_id: Number(categoryId),
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        ...(image ? { image_url: image } : {}),
      });
      const name = tradeName.trim();
      resetForm();
      finish(name);
    } catch {
      return;
    }
  }

  return (
    <div className="edit-medicine-page-wrapper med-create med-create-v2">
      <PageHeader
        title={C.heading.replace(':pharmacy', user?.name ?? '')}
        subtitle={C.subtitle}
        iconChip={<i className="fas fa-pills" />}
        actions={
          <div className="med-create-head-actions">
            <Btn to={ROUTES.medicines} variant="ghost" icon="fas fa-arrow-right">
              {C.back_to_medicines}
            </Btn>
            <Btn to={ROUTES.medicineRequests} variant="outline" icon="fas fa-plus">
              {C.request_new_button}
            </Btn>
          </div>
        }
      />
      {doneName && (
        <div className="ph-alt-notice med-create-success" role="status">
          <i className="fas fa-circle-check" aria-hidden="true" />
          <span>{C.success}</span>
          <div className="med-create-done-actions">
            <Btn variant="outline" size="sm" to={ROUTES.medicines}>
              {C.back_to_medicines}
            </Btn>
            <button
              type="button"
              className="ph-btn ghost sm"
              onClick={() => {
                setDoneName(null);
                searchRef.current?.focus();
              }}
            >
              {C.add_another}
            </button>
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <div className="med-create-layout">
          <div className="med-create-main">
            <section className="premium-card ph-card med-create-section">
              <div className="card-head">
                <div className="card-head-content">
                  <span className="med-create-step">1</span>
                  <div>
                    <h2>{C.choose_medicine}</h2>
                  </div>
                </div>
                {selected && (
                  <span className="med-create-mode-badge is-catalog">
                    <i className="fas fa-circle-check" aria-hidden="true" /> {summarySource}
                  </span>
                )}
              </div>
              <div className="card-body">
                <div className="fg">
                  <label className="fl" htmlFor="medicine_search">
                    {C.search_label} <span className="req">*</span>
                  </label>
                  <div className="med-create-search-box">
                    <i className="fas fa-magnifying-glass" aria-hidden="true" />
                    <input
                      ref={searchRef}
                      className="fc"
                      type="text"
                      id="medicine_search"
                      autoComplete="off"
                      disabled={!!selected}
                      placeholder={C.search_placeholder}
                      value={term}
                      onChange={(e) => {
                        setTerm(e.target.value);
                        setDoneName(null);
                      }}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={showResults && results.length > 0}
                      aria-controls="search_results"
                    />
                    {searching && (
                      <span
                        className="med-create-spinner"
                        role="status"
                        aria-label={C.searching}
                      />
                    )}
                  </div>
                  <small className="fl-hint">{C.search_hint}</small>
                </div>
                {searching && <p className="med-create-status">{C.searching}</p>}
                {searchError && !selected && (
                  <p className="med-create-status is-error" role="alert">
                    {C.search_error}
                  </p>
                )}
                {showResults && results.length > 0 && (
                  <div
                    id="search_results"
                    className="moh-search-results med-create-results"
                    role="listbox"
                  >
                    {results.map((option) => (
                      <div
                        key={option.key}
                        className="moh-search-item"
                        role="option"
                        aria-selected="false"
                        tabIndex={0}
                        onClick={() => pick(option)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            pick(option);
                          }
                        }}
                      >
                        <span className="med-create-result-icon" aria-hidden="true">
                          <i className="fas fa-capsules" />
                        </span>
                        <div className="med-create-result-main">
                          <strong>{option.name || '—'}</strong>
                          {option.sub && <small>{option.sub}</small>}
                        </div>
                        <div className="moh-result-meta">
                          <span
                            className={`ph-badge ${option.kind === 'moh' ? 'ans' : 'new'}`}
                          >
                            {option.kind === 'moh' ? C.badge_moh : C.badge_local}
                          </span>
                          {option.officialPrice != null && (
                            <span className="moh-result-price">
                              {C.official_price.replace(':price', String(option.officialPrice))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showResults && results.length === 0 && (
                  <div className="med-create-empty" role="status">
                    <span className="med-create-empty-icon" aria-hidden="true">
                      <i className="fas fa-circle-info" />
                    </span>
                    <div>
                      <strong>{C.no_results_title}</strong>
                      <p>{C.no_results_desc}</p>
                      <Link to={ROUTES.medicineRequests} className="med-create-inline-link">
                        {C.request_new_button}
                      </Link>
                    </div>
                  </div>
                )}
                {selected && (
                  <div className="med-create-selected">
                    <span className="med-create-selected-icon" aria-hidden="true">
                      <i
                        className={`fas ${
                          selected.kind === 'moh' ? 'fa-building-columns' : 'fa-capsules'
                        }`}
                      />
                    </span>
                    <div className="med-create-selected-info">
                      <strong>{selected.name || '—'}</strong>
                      {selected.sub && <span>{selected.sub}</span>}
                      {selected.officialPrice != null && (
                        <span className="moh-official-price">
                          {C.official_price.replace(':price', String(selected.officialPrice))}
                        </span>
                      )}
                    </div>
                    <button type="button" className="ph-btn ghost sm" onClick={clearSelection}>
                      {C.change_button}
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section className="premium-card ph-card med-create-section">
              <div className="card-head">
                <div className="card-head-content">
                  <span className="med-create-step">2</span>
                  <div>
                    <h2>{C.details_title}</h2>
                    <p>{selected ? C.details_hint_selected : C.details_hint}</p>
                  </div>
                </div>
                <span
                  className={`med-create-mode-badge ${selected ? 'is-catalog' : 'is-manual'}`}
                >
                  <i className={`fas ${selected ? 'fa-link' : 'fa-keyboard'}`} aria-hidden="true" />{' '}
                  {selected ? summarySource : C.manual_title}
                </span>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <FormField
                    label={C.manual_trade_name}
                    id="manual_trade_name"
                    required={!selected}
                    touched={touched && !selected}
                    error={
                      !selected
                        ? hasArabicInLatin
                          ? C.trade_name_english
                          : (fieldErrors.trade_name ??
                            (tradeName.trim() === '' && touched ? C.trade_name_required : null))
                        : null
                    }
                  >
                    <input
                      className="fc"
                      type="text"
                      dir="ltr"
                      placeholder={C.manual_trade_name_placeholder}
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      disabled={!!selected}
                    />
                  </FormField>
                  <FormField
                    label={C.arabic_name_label}
                    id="manual_trade_name_ar"
                    touched={touched && !selected}
                    error={
                      !selected
                        ? arNeedsArabic
                          ? C.arabic_name_required
                          : (fieldErrors.trade_name_ar ?? null)
                        : null
                    }
                  >
                    <input
                      className="fc"
                      type="text"
                      placeholder={C.arabic_name_placeholder}
                      value={tradeNameAr}
                      onChange={(e) => setTradeNameAr(e.target.value)}
                      disabled={!!selected}
                    />
                  </FormField>
                </div>
                <div className="form-row">
                  <FormField
                    label={C.manual_ingredient}
                    id="manual_ingredient"
                    required={!selected}
                    touched={touched && !selected}
                    error={
                      !selected
                        ? (fieldErrors.active_ingredient ??
                          (ingredient.trim() === '' && touched ? C.ingredient_required : null))
                        : null
                    }
                  >
                    <input
                      className="fc"
                      type="text"
                      placeholder={C.manual_ingredient_placeholder}
                      value={ingredient}
                      onChange={(e) => setIngredient(e.target.value)}
                      disabled={!!selected}
                    />
                  </FormField>
                  <AsyncBoundary
                    isLoading={!selected && categories.isLoading}
                    isError={!selected && categories.isError}
                    error={categories.error}
                    onRetry={categories.refetch}
                  >
                    <FormField
                      label={C.category}
                      id="manual_category"
                      required={!selected}
                      touched={touched && !selected}
                      error={
                        !selected
                          ? (fieldErrors.category_id ??
                            (categoryId === '' && touched ? C.category_required : null))
                          : null
                      }
                    >
                      <select
                        className="fc"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        disabled={!!selected}
                      >
                        <option value="">—</option>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name_ar}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </AsyncBoundary>
                </div>
                <FormField label={C.barcode_label} id="manual_barcode">
                  <input
                    className="fc"
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    disabled={!!selected}
                  />
                </FormField>
              </div>
            </section>

            <section className="premium-card ph-card med-create-section">
              <div className="card-head">
                <div className="card-head-content">
                  <span className="med-create-step">3</span>
                  <div>
                    <h2>{C.price_and_stock}</h2>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <FormField
                    label={C.price_label}
                    id="create_price"
                    required
                    touched={touched}
                    error={priceInvalid ? (fieldErrors.price ?? C.price_required) : null}
                  >
                    <input
                      className="fc"
                      type="number"
                      name="price"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </FormField>
                  <FormField
                    label={C.quantity_label}
                    id="create_quantity"
                    required
                    touched={touched}
                    error={qtyInvalid ? (fieldErrors.quantity ?? C.quantity_required) : null}
                    hint={
                      previewLabel ? (
                        <span className={`med-create-preview ${previewClass}`}>
                          {C.stock_preview.replace(':status', previewLabel)}
                        </span>
                      ) : undefined
                    }
                  >
                    <input
                      className="fc"
                      type="number"
                      name="quantity"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </FormField>
                </div>
                <div className="med-create-image-row">
                  <FormField label={C.image_label} id="create_image" hint={C.image_hint}>
                    <input
                      className="fc"
                      type="url"
                      name="image_url"
                      dir="ltr"
                      placeholder="https://"
                      value={imageUrl}
                      onChange={(e) => {
                        setImageUrl(e.target.value);
                        setImageBroken(false);
                      }}
                    />
                  </FormField>
                  <div className="med-create-image-preview" aria-hidden="true">
                    {imageSrc && !imageBroken ? (
                      <img src={imageSrc} alt="" onError={() => setImageBroken(true)} />
                    ) : (
                      <i className="fas fa-image" />
                    )}
                  </div>
                </div>
                {fieldErrors.image_url && (
                  <p className="med-create-status is-error" role="alert">
                    {fieldErrors.image_url}
                  </p>
                )}
              </div>
            </section>
            {serverError && serverError.kind !== 'validation' && (
              <Notice tone="error">{serverError.message}</Notice>
            )}
          </div>

          <aside className="med-create-aside">
            <div className="premium-card ph-card med-create-summary">
              <div className="card-head">
                <div className="card-head-content">
                  <div className="card-icon teal" aria-hidden="true">
                    <i className="fas fa-clipboard-check" />
                  </div>
                  <div>
                    <h2>{C.summary_title}</h2>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="med-create-summary-med">
                  <span className="med-create-summary-icon" aria-hidden="true">
                    <i
                      className={`fas ${
                        selected
                          ? selected.kind === 'moh'
                            ? 'fa-building-columns'
                            : 'fa-capsules'
                          : 'fa-pills'
                      }`}
                    />
                  </span>
                  <div>
                    <strong>{displayName || C.summary_empty}</strong>
                    <small>{summarySource}</small>
                  </div>
                </div>
                <dl className="med-create-summary-list">
                  <div>
                    <dt>{C.price_label}</dt>
                    <dd>{priceValid ? money(priceNum) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{C.quantity_label}</dt>
                    <dd>{qtyValid ? quantity : '—'}</dd>
                  </div>
                  <div>
                    <dt>{I.col_status}</dt>
                    <dd>
                      <span className={`ph-badge ${previewStatus ?? 'closed'}`}>
                        {previewLabel ?? '—'}
                      </span>
                    </dd>
                  </div>
                </dl>
                <Btn
                  type="submit"
                  variant="primary"
                  icon="fas fa-plus"
                  className="med-create-submit"
                  disabled={isSaving}
                >
                  {isSaving ? C.saving : C.add_button}
                </Btn>
                <Btn to={ROUTES.medicines} variant="outline" className="med-create-cancel">
                  {C.cancel_button}
                </Btn>
                <Link to={ROUTES.medicineRequests} className="med-create-request-link">
                  {C.request_new_button}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </form>
      <p className="med-form-back">
        <Link to={ROUTES.medicines} className="ph-btn ghost">
          <i className="fas fa-arrow-right" aria-hidden="true" /> {C.back_to_medicines}
        </Link>
      </p>
    </div>
  );
}
