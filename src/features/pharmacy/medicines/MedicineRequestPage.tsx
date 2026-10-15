import { useMemo, useState } from 'react';
import { useLang } from '@/lib/lang/LanguageContext';
import { AsyncBoundary, Btn, FormField, PageHeader } from '@/components/ui';
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

/** Client-side script-rule messages, mirroring the backend's 422 validation. */
const ERR = {
  latin: 'الاسم اللاتيني يجب ألا يحتوي حروفاً عربية — استخدم الحقل العربي أدناه.',
  arabic: 'الاسم العربي يجب أن يحتوي حروفاً عربية.',
} as const;

export function MedicineRequestPage() {
  const { STR } = useLang();
  const R = STR.pharmacy.medicines.request;
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
      {/* Was a hand-rolled `.page-heading`. No chip on this screen — the title
          carries no icon, which `PageHeader` handles by omitting `iconChip`. */}
      <PageHeader
        title={R.heading.replace(':pharmacy', user?.name ?? '')}
        subtitle={R.subtitle}
      />

      <AsyncBoundary
        isLoading={categories.isLoading}
        isError={categories.isError}
        error={categories.error}
        onRetry={categories.refetch}
        loadingRows={3}
      >
        {done && (
          <div className="ph-alt-notice">
            <i className="fas fa-circle-check" aria-hidden="true" /> {R.submit} — تم الإرسال بنجاح
          </div>
        )}

        {request.error && (
          <div className="ph-error">
            <i className="fas fa-circle-exclamation" aria-hidden="true" />
            <p>{request.error.message}</p>
          </div>
        )}

        <form action="#" method="POST" className="premium-card" onSubmit={submit}>
          <div className="card-body">
            {/* The two name fields mirror the backend's script rules. The error
                is DERIVED state (no touched tracking), so `touched` is the flag
                itself — FormField then shows exactly: neutral, or the message
                with `aria-invalid`, which is what the old hand-rolled `.ph-hint`
                paragraphs rendered. */}
            <div className="form-row">
              <FormField
                label={R.trade_name}
                id="trade_name"
                required
                touched={hasArabic}
                error={hasArabic ? ERR.latin : null}
              >
                <input
                  className="fc"
                  type="text"
                  name="trade_name"
                  dir="ltr"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  required
                />
              </FormField>
              <FormField
                label={R.trade_name_ar}
                id="trade_name_ar"
                touched={arLooksLatin}
                error={arLooksLatin ? ERR.arabic : null}
              >
                <input
                  className="fc"
                  type="text"
                  name="trade_name_ar"
                  value={tradeNameAr}
                  onChange={(e) => setTradeNameAr(e.target.value)}
                />
              </FormField>
            </div>

            <div className="form-row">
              <FormField label={R.active_ingredient} id="active_ingredient">
                <input
                  className="fc"
                  type="text"
                  name="active_ingredient"
                  dir="ltr"
                  value={activeIngredient}
                  onChange={(e) => setActiveIngredient(e.target.value)}
                />
              </FormField>
              <FormField label={R.category} id="category_id" required>
                <select
                  className="fc"
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
              </FormField>
            </div>

            {/* الباركود — اختياري، لكنه أهمّ ما يوفّر وقت الإدارة عند الاعتماد.
                A composite field (icon + scan actions) with its own component —
                deliberately NOT forced into `FormField`. `is-full` spans the row. */}
            <div className="form-row">
              <div className="is-full">
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
            <Btn type="submit" variant="primary" disabled={request.isPending || blocked}>
              {R.submit}
            </Btn>
            <Btn to="/medicines" variant="outline">
              {R.cancel}
            </Btn>
          </div>
        </form>
      </AsyncBoundary>
    </div>
  );
}
