import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import type { ApiInventoryItem } from '@/api/pharmacyTypes';
import { AsyncBoundary, Btn, FormField, Notice, PageHeader } from '@/components/ui';
import { useLang } from '@/lib/lang/LanguageContext';
import { ROUTES } from '@/routes/paths';
import { stockStatus } from '@/lib/stock';
import { toast } from '@/lib/toast';

export function MedicineEditPage() {
  const { STR } = useLang();
  const E = STR.pharmacy.medicines.edit;
  const T = STR.pharmacy.toast;
  const S = STR.pharmacy.status;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const validId = Number.isInteger(idNum) && idNum > 0;

  const query = useApiQuery<ApiInventoryItem>((signal) => api.getMedicine(idNum, signal), [idNum], {
    enabled: validId,
    queryKey: keys.medicines.detail(idNum),
  });
  const item = query.data;

  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [available, setAvailable] = useState(true);
  const [touched, setTouched] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    seeded.current = false;
    setTouched(false);
  }, [idNum]);

  useEffect(() => {
    if (seeded.current || !item) return;
    seeded.current = true;
    setPrice(String(item.price));
    setQuantity(String(item.quantity));
    setAvailable(item.is_available);
  }, [item]);

  const update = useApiMutation(
    (body: Record<string, unknown>) => api.updateMedicine(idNum, body),
    {
      invalidates: [
        keys.medicines.detail(idNum),
        keys.inventory.list({ per_page: 100 }),
        keys.dashboardStats,
        keys.sidebarCounts,
      ],
    },
  );
  const remove = useApiMutation(() => api.deleteMedicine(idNum), {
    invalidates: [
      keys.inventory.list({ per_page: 100 }),
      keys.dashboardStats,
      keys.sidebarCounts,
    ],
  });

  const priceNum = Number(price);
  const qtyNum = Number(quantity);
  const priceInvalid =
    touched && !(price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0);
  const qtyInvalid =
    touched && !(quantity.trim() !== '' && Number.isInteger(qtyNum) && qtyNum >= 0);
  const previewQty = Number.isInteger(qtyNum) && qtyNum >= 0 ? qtyNum : null;
  const previewStatus =
    !available ? 'out' : previewQty == null ? null : stockStatus(previewQty);
  const previewLabel =
    previewStatus == null
      ? null
      : previewStatus === 'ok'
        ? S.available
        : previewStatus === 'low'
          ? S.low
          : S.out;
  const previewClass =
    previewStatus === 'ok' ? 'is-available' : previewStatus ? `is-${previewStatus}` : '';

  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (update.fieldErrors) {
      for (const [key, messages] of Object.entries(update.fieldErrors)) {
        out[key] = messages.join(' ');
      }
    }
    return out;
  }, [update.fieldErrors]);
  const serverError = update.error && update.error.kind !== 'validation' ? update.error : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!item || item.medicine_id == null || priceInvalid || qtyInvalid) return;
    try {
      await update.run({
        medicine_id: item.medicine_id,
        price: priceNum,
        quantity: qtyNum,
        is_available: available,
      });
      toast.success(E.success);
      navigate(ROUTES.medicines);
    } catch {
      return;
    }
  }

  async function handleDelete() {
    if (!window.confirm(E.delete_confirm)) return;
    try {
      await remove.run();
      toast.success(T.deleted);
      navigate(ROUTES.medicines);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : T.delete_failed);
    }
  }

  return (
    <div className="edit-medicine-page-wrapper med-create">
      <PageHeader title={E.heading_page} subtitle={E.subtitle} />
      <AsyncBoundary
        isLoading={validId && query.isLoading}
        isError={query.isError}
        error={query.error}
        isEmpty={!validId || (query.status === 'ready' && !query.data)}
        onRetry={query.refetch}
        emptyIcon="fas fa-capsules"
        emptyTitle={E.not_found}
      >
        {item && (
          <form onSubmit={submit} noValidate>
            <div className="premium-card ph-card">
              <div className="card-head">
                <div className="card-head-content">
                  <div className="card-icon teal" aria-hidden="true">
                    <i className="fas fa-capsules" />
                  </div>
                  <div>
                    <h2>{E.info_section}</h2>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <FormField label={E.trade_name} id="edit_trade_name">
                    <input
                      className="fc"
                      type="text"
                      value={item.medicine?.trade_name_ar || item.medicine?.trade_name || '—'}
                      readOnly
                    />
                  </FormField>
                  <FormField label={E.active_ingredient} id="edit_active_ingredient">
                    <input
                      className="fc"
                      type="text"
                      value={item.medicine?.active_ingredient || '—'}
                      readOnly
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <div className="premium-card ph-card">
              <div className="card-head">
                <div className="card-head-content">
                  <div className="card-icon teal" aria-hidden="true">
                    <i className="fas fa-tag" />
                  </div>
                  <div>
                    <h2>{E.stock_section}</h2>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <FormField
                    label={E.price_label}
                    id="edit_price"
                    required
                    touched={touched}
                    error={priceInvalid ? (fieldErrors.price ?? E.price_required) : null}
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
                    label={E.quantity_label}
                    id="edit_quantity"
                    required
                    touched={touched}
                    error={qtyInvalid ? (fieldErrors.quantity ?? E.quantity_required) : null}
                    hint={
                      previewLabel ? (
                        <span className={`med-create-preview ${previewClass}`}>
                          {E.status_hint.replace(':status', previewLabel)}
                        </span>
                      ) : undefined
                    }
                  >
                    <input
                      className="fc"
                      type="number"
                      name="quantity"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </FormField>
                </div>
                <label className="med-availability">
                  <input
                    type="checkbox"
                    checked={available}
                    onChange={(e) => setAvailable(e.target.checked)}
                  />
                  <span>{E.available_now}</span>
                </label>
              </div>
              <div className="card-foot">
                <Btn
                  type="button"
                  variant="danger"
                  className="med-edit-delete"
                  disabled={remove.isPending || update.isPending}
                  onClick={() => void handleDelete()}
                >
                  {remove.isPending ? E.deleting : E.delete_button}
                </Btn>
                <Btn
                  type="submit"
                  variant="primary"
                  disabled={
                    update.isPending ||
                    remove.isPending ||
                    item.medicine_id == null ||
                    priceInvalid ||
                    qtyInvalid
                  }
                >
                  {update.isPending ? E.saving : E.update_button}
                </Btn>
                <Btn to={ROUTES.medicines} variant="outline">
                  {E.cancel_button}
                </Btn>
              </div>
            </div>
            {serverError && <Notice tone="error">{serverError.message}</Notice>}
          </form>
        )}
      </AsyncBoundary>
      <p className="med-form-back">
        <Link to={ROUTES.medicines} className="ph-btn ghost">
          <i className="fas fa-arrow-right" aria-hidden="true" /> {E.back_to_medicines}
        </Link>
      </p>
    </div>
  );
}
