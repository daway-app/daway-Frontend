import { useMemo, useState } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary } from '@/components/ui';
import { BarcodeField } from '@/components/pharmacy/BarcodeField';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import type { ApiCategory } from '@/api/pharmacyTypes';

/**
 * Pharmacy — request a new medicine. Live against the real endpoints.
 *
 * Port of `resources/views/pharmacy/medicines/request.blade.php`.
 * CSS family: legacy (`edit-medicine-page-wrapper` + `premium-card`).
 *
 * Data sources:
 *  - categories → `GET /api/categories` (public). The payload has no plain
 *    `name`; the display name is `name_ar`.
 *  - submit     → `POST /api/pharmacy/medicine-requests`.
 *
 * The backend's validation shapes two fields, and the form mirrors it so the
 * user is not surprised by a 422:
 *  - `trade_name` must NOT contain Arabic (`not_regex:/[\x{0600}-\x{06FF}]/u`)
 *    ⇒ kept `dir="ltr"` and labelled as the Latin name;
 *  - `trade_name_ar`, when supplied, MUST contain Arabic.
 */

const R = AR.pharmacy.medicines.request;

export function MedicineRequestPage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const [tradeName, setTradeName] = useState('');
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [done, setDone] = useState(false);

  const categories = useApiQuery<ApiCategory[]>((signal) => api.categories(signal), [], {
    isEmpty: (rows) => rows.length === 0,
  });

  const request = useApiMutation((body: Record<string, unknown>) => api.requestMedicine(body));

  const options = useMemo(() => categories.data ?? [], [categories.data]);

  /** Mirrors the backend's Arabic-script rule, so the user is warned before submit. */
  const hasArabic = /[\u0600-\u06FF]/.test(tradeName);
  const arLooksLatin = tradeNameAr.trim() !== '' && !/[\u0600-\u06FF]/.test(tradeNameAr);
  const blocked = hasArabic || arLooksLatin;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    if (blocked) return;
    try {
      await request.run({
        trade_name: tradeName.trim(),
        ...(tradeNameAr.trim() ? { trade_name_ar: tradeNameAr.trim() } : {}),
        ...(activeIngredient.trim() ? { active_ingredient: activeIngredient.trim() } : {}),
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        category_id: Number(categoryId),
      });
      setDone(true);
      setTradeName('');
      setTradeNameAr('');
      setActiveIngredient('');
      setCategoryId('');
      setBarcode('');
    } catch {
      // `request.error` renders below.
    }
  }

  return (
    <div className="edit-medicine-page-wrapper">
      <div className="page-heading">
        <div>
          <h1>{R.heading.replace(':pharmacy', user?.name ?? '')}</h1>
          <p>{R.subtitle}</p>
        </div>
      </div>

      <AsyncBoundary
        isLoading={categories.isLoading}
        isError={categories.isError}
        error={categories.error}
        onRetry={categories.refetch}
        loadingRows={3}
      >
        {done && (
          <div className="ph-alt-notice" style={{ marginBlockEnd: 16 }}>
            <i className="fas fa-circle-check" aria-hidden="true" /> {R.submit} — تم الإرسال بنجاح
          </div>
        )}

        {request.error && (
          <div className="ph-error" style={{ marginBlockEnd: 16 }}>
            <i className="fas fa-circle-exclamation" aria-hidden="true" />
            <p>{request.error.message}</p>
          </div>
        )}

        <form action="#" method="POST" className="premium-card" onSubmit={submit}>
          <div className="card-body">
            <div className="form-row">
              <div className="fg">
                <label className="fl" htmlFor="trade_name">
                  {R.trade_name} <span className="req">*</span>
                </label>
                <input
                  className="fc"
                  type="text"
                  id="trade_name"
                  name="trade_name"
                  dir="ltr"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  required
                  aria-invalid={hasArabic}
                />
                {hasArabic && (
                  <p className="ph-hint" style={{ color: 'var(--ph-red)' }}>
                    الاسم اللاتيني يجب ألا يحتوي حروفاً عربية — استخدم الحقل العربي أدناه.
                  </p>
                )}
              </div>
              <div className="fg">
                <label className="fl" htmlFor="trade_name_ar">
                  {R.trade_name_ar}
                </label>
                <input
                  className="fc"
                  type="text"
                  id="trade_name_ar"
                  name="trade_name_ar"
                  value={tradeNameAr}
                  onChange={(e) => setTradeNameAr(e.target.value)}
                  aria-invalid={arLooksLatin}
                />
                {arLooksLatin && (
                  <p className="ph-hint" style={{ color: 'var(--ph-red)' }}>
                    الاسم العربي يجب أن يحتوي حروفاً عربية.
                  </p>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="fg">
                <label className="fl" htmlFor="active_ingredient">
                  {R.active_ingredient}
                </label>
                <input
                  className="fc"
                  type="text"
                  id="active_ingredient"
                  name="active_ingredient"
                  dir="ltr"
                  value={activeIngredient}
                  onChange={(e) => setActiveIngredient(e.target.value)}
                />
              </div>
              <div className="fg">
                <label className="fl" htmlFor="category_id">
                  {R.category} <span className="req">*</span>
                </label>
                <select
                  className="fc"
                  id="category_id"
                  name="category_id"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="">—</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* الباركود — اختياري، لكنه أهمّ ما يوفّر وقت الإدارة عند الاعتماد. */}
            <div className="form-row">
              <div className="fg" style={{ gridColumn: '1 / -1' }}>
                <BarcodeField
                  id="request_barcode"
                  name="barcode"
                  label={R.barcode}
                  value={barcode}
                  onValueChange={setBarcode}
                  showStatus
                />
              </div>
            </div>
          </div>

          <div className="card-foot">
            <button type="submit" className="btn-submit" disabled={request.isPending || blocked}>
              {R.submit}
            </button>
            <a href="/medicines" className="btn-cancel">
              {R.cancel}
            </a>
          </div>
        </form>
      </AsyncBoundary>
    </div>
  );
}
