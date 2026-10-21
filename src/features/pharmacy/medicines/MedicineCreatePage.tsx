/**
 * Pharmacy — add a medicine to the pharmacy's own stock.
 * Port of `pharmacy/medicines/create.blade.php` (legacy
 * `edit-medicine-page-wrapper` + `premium-card` family, see
 * `src/styles/pages/medicines-create.css`).
 * Flow mirrors Blade: catalogue search -> price/stock -> manual fallback.
 */
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
import { ApiError } from '@/api/errors';

/** One flattened catalogue hit — both sources share this shape. */
interface CatalogOption {
  key: string;
  kind: 'medicine' | 'moh';
  id: number;
  name: string;
  sub: string | null;
  officialPrice: number | null;
}

const ARABIC_RE = /[؀-ۿ]/;

export function MedicineCreatePage() {
  const { STR } = useLang();
  const C = STR.pharmacy.medicines.create;
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
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [term]);
  const [results, setResults] = useState<CatalogOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    if (selected) return;
    if (debounced.length < 2) { setResults([]); setSearching(false); setSearchError(false); return; }
    let cancelled = false;
    setSearching(true); setSearchError(false);
    void api.searchCatalog(debounced).then((res) => {
      if (cancelled) return;
      const flat: CatalogOption[] = [
        ...(res.medicines ?? []).map((m) => ({ key: `medicine-${m.id}`, kind: 'medicine' as const, id: m.id, name: m.name ?? '—', sub: m.sub ?? null, officialPrice: null })),
        ...(res.moh_catalog ?? []).map((m) => ({ key: `moh-${m.id}`, kind: 'moh' as const, id: m.id, name: m.name ?? '—', sub: m.sub ?? null, officialPrice: m.official_price ?? null })),
      ];
      setResults(flat);
    }).catch(() => { if (!cancelled) { setResults([]); setSearchError(true); } })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [api, debounced, selected]);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [touched, setTouched] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categories = useApiQuery<ApiCategory[]>((s) => api.categories(s), [], {
    enabled: manualOpen,
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
  const [doneName, setDoneName] = useState<string | null>(null);
  function pick(o: CatalogOption) {
    setSelected(o); setResults([]); setSearchError(false);
    setTerm(o.name); setTouched(false); setDoneName(null);
    if (o.officialPrice != null && price.trim() === '') setPrice(String(o.officialPrice));
  }
  function clearSelection() { setSelected(null); setTerm(''); setResults([]); setDoneName(null); }
  const priceNum = Number(price);
  const qtyNum = Number(quantity);
  const priceInvalid = touched && !(price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0);
  const qtyInvalid = touched && !(quantity.trim() !== '' && Number.isInteger(qtyNum) && qtyNum >= 0);
  const previewQty = Number.isInteger(qtyNum) && qtyNum >= 0 ? qtyNum : null;
  const previewStatus = previewQty == null ? null : stockStatus(previewQty);
  const previewLabel = previewStatus == null ? null : previewStatus === 'ok' ? C.status_available : previewStatus === 'low' ? C.status_low : C.status_out;
  async function submitCatalog(e: React.FormEvent) {
    e.preventDefault(); setTouched(true); setDoneName(null);
    if (!selected || priceInvalid || qtyInvalid) return;
    try {
      const image = imageUrl.trim();
      await save.run({ ...(selected.kind === 'medicine' ? { medicine_id: selected.id } : { moh_medicine_id: selected.id }), price: priceNum, quantity: qtyNum, is_available: qtyNum > 0, ...(image ? { image_url: image } : {}) });
      setDoneName(selected.name); setSelected(null); setTerm('');
      setPrice(''); setQuantity(''); setImageUrl(''); setTouched(false);
    } catch { /* save.error renders below */ }
  }
  const hasArabicInLatin = ARABIC_RE.test(tradeName);
  const arNeedsArabic = tradeNameAr.trim() !== '' && !ARABIC_RE.test(tradeNameAr);
  const manualInvalid = tradeName.trim() === '' || hasArabicInLatin || arNeedsArabic || ingredient.trim() === '' || categoryId === '';
  async function submitManual(e: React.FormEvent) {
    e.preventDefault(); setDoneName(null);
    if (manualInvalid || priceInvalid || qtyInvalid) { setTouched(true); return; }
    try {
      await saveByName.run({ trade_name: tradeName.trim(), ...(tradeNameAr.trim() ? { trade_name_ar: tradeNameAr.trim() } : {}), active_ingredient: ingredient.trim(), price: priceNum, quantity: qtyNum, is_available: qtyNum > 0, category_id: Number(categoryId), ...(barcode.trim() ? { barcode: barcode.trim() } : {}) });
      setDoneName(tradeName.trim()); setManualOpen(false);
      setTradeName(''); setTradeNameAr(''); setIngredient(''); setBarcode(''); setCategoryId('');
      setPrice(''); setQuantity(''); setTouched(false);
    } catch { /* saveByName.error renders below */ }
  }
  const serverError = save.error ?? saveByName.error;
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    const merge = (err: ApiError | null) => {
      if (err?.kind !== 'validation' || !err.errors) return;
      for (const [k, v] of Object.entries(err.errors)) if (!(k in out)) out[k] = v.join(' ');
    };
    merge(save.error); merge(saveByName.error);
    return out;
  }, [save.error, saveByName.error]);
  const showResults = !selected && !searching && !searchError && debounced.length >= 2;
  return (
    <div className="edit-medicine-page-wrapper med-create">
      <PageHeader title={C.heading.replace(':pharmacy', user?.name ?? '')} subtitle={C.subtitle} />
      {doneName && (
        <div className="ph-alt-notice" role="status">
          <i className="fas fa-check-circle" aria-hidden="true" /> {C.success}
          <div className="med-create-done-actions">
            <Btn variant="outline" size="sm" to={ROUTES.medicines}>{C.back_to_medicines}</Btn>
            <button type="button" className="ph-btn ghost" onClick={() => { setDoneName(null); document.getElementById('medicine_search')?.focus(); }}>{C.add_another}</button>
          </div>
        </div>
      )}
      <div className="premium-card ph-card">
        <div className="card-head">
          <div className="card-head-content"><div className="card-icon teal" aria-hidden="true"><i className="fas fa-magnifying-glass" /></div><div><h2>{C.choose_medicine}</h2></div></div>
          {selected && (<button type="button" className="ph-btn ghost" onClick={clearSelection}>{C.change_button}</button>)}
        </div>
        <div className="card-body">
          <div className="fg">
            <label className="fl" htmlFor="medicine_search">{C.search_label} <span className="req">*</span></label>
            <input className="fc" type="text" id="medicine_search" autoComplete="off" disabled={!!selected} placeholder={C.search_placeholder} value={term} onChange={(e) => { setTerm(e.target.value); setDoneName(null); }} role="combobox" aria-autocomplete="list" aria-expanded={showResults && results.length > 0} aria-controls="search_results" />
            <small className="fl-hint">{C.search_hint}</small>
          </div>
          {searching && <p className="med-create-status">{C.searching}</p>}
          {searchError && !selected && (<p className="med-create-status is-error" role="alert">{C.search_error}</p>)}
          {showResults && results.length > 0 && (
            <div id="search_results" className="moh-search-results" role="listbox">
              {results.map((opt) => (
                <div key={opt.key} className="moh-search-item" role="option" aria-selected="false" tabIndex={0} onClick={() => pick(opt)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(opt); } }}>
                  <div><strong>{opt.name}</strong>{opt.sub && <small>{opt.sub}</small>}</div>
                  <div className="moh-result-meta">
                    <span className={`moh-result-badge${opt.kind === 'medicine' ? ' moh-result-badge-local' : ''}`}>{opt.kind === 'moh' ? C.badge_moh : C.badge_local}</span>
                    {opt.officialPrice != null && (<span className="moh-result-price">{C.official_price.replace(':price', String(opt.officialPrice))}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="moh-selected">
              <div className="moh-selected-info"><strong>{selected.name}</strong>{selected.sub && <span>{selected.sub}</span>}{selected.officialPrice != null && (<span className="moh-official-price">{C.official_price.replace(':price', String(selected.officialPrice))}</span>)}</div>
            </div>
          )}
          {showResults && results.length === 0 && !manualOpen && (
            <div className="med-create-manual-cta">
              <p className="med-create-manual-title">{C.no_results_title}</p>
              <p className="med-create-manual-desc">{C.no_results_desc}</p>
              <button type="button" className="ph-btn outline" onClick={() => setManualOpen(true)}><i className="fas fa-plus" aria-hidden="true" /> {C.manual_button}</button>
              <Btn variant="ghost" size="sm" to={ROUTES.medicineRequests}>{C.request_new_button}</Btn>
            </div>
          )}
        </div>
      </div>
      {selected && (
        <form onSubmit={submitCatalog} noValidate>
          <div className="premium-card ph-card">
            <div className="card-head"><div className="card-head-content"><div className="card-icon teal" aria-hidden="true"><i className="fas fa-tag" /></div><div><h2>{C.price_and_stock}</h2></div></div></div>
            <div className="card-body">
              <div className="form-row">
                <FormField label={C.price_label} id="create_price" required touched={touched} error={priceInvalid ? (fieldErrors.price ?? C.price_required) : null}>
                  <input className="fc" type="number" name="price" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </FormField>
                <FormField label={C.quantity_label} id="create_quantity" required touched={touched} error={qtyInvalid ? (fieldErrors.quantity ?? C.quantity_required) : null} hint={previewLabel ? (<span className={`med-create-preview is-${previewStatus}`}>{C.stock_preview.replace(':status', previewLabel)}</span>) : undefined}>
                  <input className="fc" type="number" name="quantity" min="0" step="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </FormField>
              </div>
              <FormField label={C.image_label} id="create_image" hint={C.image_hint}>
                <input className="fc" type="url" name="image_url" dir="ltr" placeholder="https://" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
              </FormField>
              {fieldErrors.image_url && (<p className="med-create-status is-error" role="alert">{fieldErrors.image_url}</p>)}
            </div>
            <div className="card-foot">
              <Btn type="submit" variant="primary" disabled={save.isPending || !selected || priceInvalid || qtyInvalid}>{save.isPending ? C.saving : C.add_button}</Btn>
              <Btn to={ROUTES.medicines} variant="outline">{C.cancel_button}</Btn>
            </div>
          </div>
        </form>
      )}
      {manualOpen && (
        <form onSubmit={submitManual} noValidate>
          <div className="premium-card ph-card">
            <div className="card-head"><div className="card-head-content"><div className="card-icon teal" aria-hidden="true"><i className="fas fa-pen" /></div><div><h2>{C.manual_title}</h2></div></div><button type="button" className="ph-btn ghost" onClick={() => setManualOpen(false)}>{C.cancel_button}</button></div>
            <div className="card-body">
              <div className="form-row">
                <FormField label={C.manual_trade_name} id="manual_trade_name" required touched={hasArabicInLatin || touched} error={hasArabicInLatin ? C.trade_name_english : (fieldErrors.trade_name ?? (tradeName.trim() === '' && touched ? C.trade_name_required : null))}>
                  <input className="fc" type="text" dir="ltr" placeholder={C.manual_trade_name_placeholder} value={tradeName} onChange={(e) => setTradeName(e.target.value)} required />
                </FormField>
                <FormField label={C.arabic_name_label} id="manual_trade_name_ar" touched={arNeedsArabic} error={arNeedsArabic ? C.arabic_name_required : (fieldErrors.trade_name_ar ?? null)}>
                  <input className="fc" type="text" placeholder={C.arabic_name_placeholder} value={tradeNameAr} onChange={(e) => setTradeNameAr(e.target.value)} />
                </FormField>
              </div>
              <div className="form-row">
                <FormField label={C.manual_ingredient} id="manual_ingredient" required touched={touched} error={fieldErrors.active_ingredient ?? (ingredient.trim() === '' && touched ? C.ingredient_required : null)}>
                  <input className="fc" type="text" placeholder={C.manual_ingredient_placeholder} value={ingredient} onChange={(e) => setIngredient(e.target.value)} required />
                </FormField>
                <AsyncBoundary isLoading={categories.isLoading} isError={categories.isError} error={categories.error} onRetry={categories.refetch}>
                  <FormField label={C.category} id="manual_category" required touched={touched} error={fieldErrors.category_id ?? (categoryId === '' && touched ? C.category_required : null)}>
                    <select className="fc" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required><option value="">—</option>{categoryOptions.map((c) => (<option key={c.id} value={c.id}>{c.name_ar}</option>))}</select>
                  </FormField>
                </AsyncBoundary>
              </div>
              <div className="form-row">
                <FormField label={C.price_label} id="manual_price" required touched={touched} error={priceInvalid ? (fieldErrors.price ?? C.price_required) : null}>
                  <input className="fc" type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </FormField>
                <FormField label={C.quantity_label} id="manual_quantity" required touched={touched} error={qtyInvalid ? (fieldErrors.quantity ?? C.quantity_required) : null}>
                  <input className="fc" type="number" min="0" step="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </FormField>
              </div>
              <FormField label={C.barcode_label} id="manual_barcode">
                <input className="fc" type="text" dir="ltr" inputMode="numeric" autoComplete="off" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </FormField>
            </div>
            <div className="card-foot">
              <Btn type="submit" variant="primary" disabled={saveByName.isPending || manualInvalid || priceInvalid || qtyInvalid} onClick={() => setTouched(true)}>{saveByName.isPending ? C.saving : C.add_button}</Btn>
              <button type="button" className="ph-btn outline" onClick={() => setManualOpen(false)}>{C.cancel_button}</button>
            </div>
          </div>
        </form>
      )}
      {serverError && serverError.kind !== 'validation' && (<Notice tone="error">{serverError.message}</Notice>)}
      <p className="med-form-back"><Link to={ROUTES.medicines} className="ph-btn ghost"><i className="fas fa-arrow-right" aria-hidden="true" /> {C.back_to_medicines}</Link></p>
    </div>
  );
}
