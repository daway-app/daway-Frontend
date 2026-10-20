import { useEffect, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Modal,
  Notice,
  PageHeader,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { ApiError } from '@/api/errors';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { money } from '../shared';
import { formatDistanceRange, validateTierDraft, type TierDraft } from './tierModel';
import type {
  AdminDeliveryPricingResponse,
  DeliveryFeeTier,
  DeliveryPricingMode,
} from '@/api/adminTypes';

/**
 * Delivery pricing — the master switch plus the distance fee tiers.
 *
 * ============================================================================
 * THE SERVER OWNS THE TIER RULES
 * ============================================================================
 * The set of ACTIVE tiers must start at 0 m, have no overlaps or gaps, and end
 * with at most one open-ended tier; enabling pricing requires at least one
 * valid active tier. None of that is re-implemented here. A tier is created as
 * a DRAFT (`is_active: false`) and stays unconstrained until it is activated,
 * so the UI surface of the rules is:
 *
 *   · the master switch reads its state from the server and REFETCHES after a
 *     toggle, so a rejected activation cannot leave the switch lying;
 *   · a 422 always carries `errors.tiers[0]` — the server's own Arabic message —
 *     which is shown verbatim rather than replaced by a generic one.
 *
 * Deletes and activations are confirmed/enabled against that same contract: a
 * delete that would leave a gap comes back as a 422 and its message is toasted.
 */

/** The server's tier-level message, or its `message`, or the local fallback. */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const first = err.errors?.tiers?.[0];
    if (first) return first;
    if (err.message) return err.message;
  }
  return fallback;
}

/** A compact km form of the range, shown beside the meters value. */
function formatKmRange(
  minKm: number,
  maxKm: number | null,
  openEndedLabel: string,
  kmUnit: string,
): string {
  if (maxKm === null || maxKm === undefined) return `${minKm} ${kmUnit} – ${openEndedLabel}`;
  return `${minKm} – ${maxKm} ${kmUnit}`;
}

export function AdminDeliveryPricingPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const S = STR.admin.delivery_pricing;

  const query = useApiQuery<AdminDeliveryPricingResponse>(
    (signal) => api.admin.deliveryPricing(signal),
    [],
    { queryKey: keys.deliveryPricing },
  );

  const tiers = query.data?.tiers ?? [];

  // The switch mirrors the server, but holds a local value so a toggle is
  // reflected before the round-trip completes — and reverted if it fails.
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (query.data) setEnabled(query.data.enabled);
  }, [query.data]);

  // The pricing mode + base fee + per-km rate mirror the server; a save sends all
  // three so the server validates the resulting configuration before any write.
  const [mode, setMode] = useState<DeliveryPricingMode>('tiers');
  const [baseFee, setBaseFee] = useState('');
  const [perKmRate, setPerKmRate] = useState('');
  const [settingsErrors, setSettingsErrors] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    if (query.data) {
      setMode(query.data.mode);
      setBaseFee(query.data.base_fee === null ? '' : String(query.data.base_fee));
      setPerKmRate(query.data.per_km_rate === null ? '' : String(query.data.per_km_rate));
    }
  }, [query.data]);

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; tier: DeliveryFeeTier | null } | null>(
    null,
  );
  const [draft, setDraft] = useState<TierDraft>({
    minDistanceMeters: '',
    maxDistanceMeters: '',
    fee: '',
  });
  const [isActive, setIsActive] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeliveryFeeTier | null>(null);

  const statusMutation = useApiMutation(async (next: boolean) =>
    api.admin.setDeliveryPricingEnabled(next),
  );
  const createMutation = useApiMutation(async (body: Record<string, unknown>) =>
    api.admin.createDeliveryFeeTier(body),
  );
  const updateMutation = useApiMutation(async (id: number, body: Record<string, unknown>) =>
    api.admin.updateDeliveryFeeTier(id, body),
  );
  const toggleMutation = useApiMutation(async (id: number) => api.admin.toggleDeliveryFeeTier(id));
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deleteDeliveryFeeTier(id));
  const settingsMutation = useApiMutation(async (body: Record<string, unknown>) =>
    api.admin.updateDeliveryPricingSettings(body),
  );

  async function handleToggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    try {
      await statusMutation.run(next);
      toast.success(next ? S.enabled_saved : S.disabled_saved);
      query.refetch();
    } catch (err) {
      setEnabled(previous);
      toast.error(errorMessage(err, S.generic_error));
    }
  }

  function openCreate() {
    setDraft({ minDistanceMeters: '', maxDistanceMeters: '', fee: '' });
    setIsActive(false);
    setSubmitted(false);
    setServerErrors(null);
    setModal({ mode: 'create', tier: null });
  }

  function openEdit(tier: DeliveryFeeTier) {
    setDraft({
      minDistanceMeters: String(tier.min_distance_meters),
      maxDistanceMeters: tier.max_distance_meters === null ? '' : String(tier.max_distance_meters),
      fee: String(tier.fee),
    });
    setIsActive(tier.is_active);
    setSubmitted(false);
    setServerErrors(null);
    setModal({ mode: 'edit', tier });
  }

  const clientErrors = validateTierDraft(draft);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSavingSettings = settingsMutation.isPending;

  async function saveSettings() {
    const body: Record<string, unknown> = {
      mode,
      base_fee: baseFee.trim() === '' ? null : Number(baseFee),
      per_km_rate: perKmRate.trim() === '' ? null : Number(perKmRate),
    };

    try {
      await settingsMutation.run(body);
      setSettingsErrors(null);
      toast.success(S.settings_saved);
      query.refetch();
    } catch (err) {
      setSettingsErrors(err instanceof ApiError ? (err.errors ?? null) : null);
      toast.error(errorMessage(err, S.generic_error));
    }
  }

  async function saveTier() {
    setSubmitted(true);
    if (Object.keys(validateTierDraft(draft)).length > 0) return;

    const body = {
      min_distance_meters: Number(draft.minDistanceMeters),
      max_distance_meters:
        draft.maxDistanceMeters.trim() === '' ? null : Number(draft.maxDistanceMeters),
      fee: Number(draft.fee),
      is_active: isActive,
    };

    try {
      if (modal?.mode === 'edit' && modal.tier) {
        await updateMutation.run(modal.tier.id, body);
        toast.success(S.tier_updated);
      } else {
        await createMutation.run(body);
        toast.success(S.tier_created);
      }
      setModal(null);
      query.refetch();
    } catch (err) {
      setServerErrors(err instanceof ApiError ? (err.errors ?? null) : null);
      toast.error(errorMessage(err, S.generic_error));
    }
  }

  async function handleToggleTier(tier: DeliveryFeeTier) {
    try {
      await toggleMutation.run(tier.id);
      toast.success(S.tier_updated);
      query.refetch();
    } catch (err) {
      toast.error(errorMessage(err, S.generic_error));
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const tier = confirmDelete;
    setConfirmDelete(null);
    try {
      await deleteMutation.run(tier.id);
      toast.success(S.tier_deleted);
      query.refetch();
    } catch (err) {
      toast.error(errorMessage(err, S.generic_error));
    }
  }

  return (
    <>
      <PageHeader
        title={S.title}
        subtitle={S.subtitle}
        icon="fas fa-truck"
        actions={
          <Btn variant="primary" icon="fas fa-plus" onClick={openCreate}>
            {S.add_tier}
          </Btn>
        }
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <Card>
              <Notice tone="info">{enabled ? S.enabled_hint : S.disabled_hint}</Notice>
              <label className="admin-switch" style={{ marginBlockStart: 16 }}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={enabled}
                  disabled={statusMutation.isPending}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
                <span className="admin-switch__track" aria-hidden="true" />
                <span className="admin-switch__label">{S.enabled_label}</span>
              </label>
            </Card>

            <Card title={S.settings_title} icon="fas fa-sliders">
              {settingsErrors?.settings?.length ? (
                <div style={{ marginBlockEnd: 16 }}>
                  <Notice tone="error">{settingsErrors.settings[0]}</Notice>
                </div>
              ) : null}

              <div className="admin-form-grid">
                <FormField label={S.mode_label} id="delivery-mode" hint={S.mode_hint}>
                  <select
                    className="form-control"
                    id="delivery-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as DeliveryPricingMode)}
                  >
                    <option value="tiers">{S.mode_tiers}</option>
                    <option value="per_km">{S.mode_per_km}</option>
                  </select>
                </FormField>

                {mode === 'tiers' ? (
                  <FormField label={S.base_fee} id="delivery-base-fee" hint={S.base_fee_hint}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      value={baseFee}
                      onChange={(e) => setBaseFee(e.target.value)}
                    />
                  </FormField>
                ) : (
                  <FormField label={S.per_km_rate} id="delivery-per-km-rate" hint={S.per_km_rate_hint}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      value={perKmRate}
                      onChange={(e) => setPerKmRate(e.target.value)}
                    />
                  </FormField>
                )}
              </div>

              <div style={{ marginBlockStart: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn
                  variant="primary"
                  icon="fas fa-save"
                  onClick={saveSettings}
                  disabled={isSavingSettings}
                >
                  {isSavingSettings ? S.saving : S.save}
                </Btn>
              </div>
            </Card>

            <Card title={S.tiers_title} icon="fas fa-list-ul">
              {tiers.length === 0 ? (
                <EmptyState
                  icon="fas fa-truck"
                  title={S.empty_title}
                  description={S.empty_hint}
                  action={
                    <Btn size="sm" variant="primary" icon="fas fa-plus" onClick={openCreate}>
                      {S.add_tier}
                    </Btn>
                  }
                />
              ) : (
                <DataTable
                  caption={S.tiers_title}
                  columns={[
                    S.col_range,
                    S.col_fee,
                    S.col_status,
                    { label: S.col_actions, className: 'ac-actions' },
                  ]}
                >
                  {tiers.map((tier) => (
                    <tr key={tier.id}>
                      <td>
                        {formatDistanceRange(
                          tier.min_distance_meters,
                          tier.max_distance_meters,
                          S.open_ended,
                          S.unit_meters,
                        )}
                        {tier.min_distance_km != null && (
                          <span className="admin-muted">
                            {' '}
                            (
                            {formatKmRange(
                              tier.min_distance_km,
                              tier.max_distance_km,
                              S.open_ended,
                              S.unit_km,
                            )}
                            )
                          </span>
                        )}
                      </td>
                      <td>{money(tier.fee)}</td>
                      <td>
                        <Badge variant={tier.is_active ? 'ok' : 'out'}>
                          {tier.is_active ? S.active : S.inactive}
                        </Badge>
                      </td>
                      <td className="ac-actions">
                        <div className="action-btn-group">
                          <button
                            type="button"
                            className="action-btn edit"
                            title={S.edit}
                            aria-label={`${S.edit} — ${formatDistanceRange(
                              tier.min_distance_meters,
                              tier.max_distance_meters,
                              S.open_ended,
                              S.unit_meters,
                            )}`}
                            onClick={() => openEdit(tier)}
                          >
                            <i className="fas fa-pen" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="action-btn view"
                            title={tier.is_active ? S.inactive : S.active}
                            aria-label={tier.is_active ? S.inactive : S.active}
                            disabled={toggleMutation.isPending}
                            onClick={() => handleToggleTier(tier)}
                          >
                            <i
                              className={tier.is_active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete"
                            title={S.delete}
                            aria-label={S.delete}
                            disabled={deleteMutation.isPending}
                            onClick={() => setConfirmDelete(tier)}
                          >
                            <i className="fas fa-trash-can" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>

      <Modal
        open={modal !== null}
        title={modal?.mode === 'edit' ? S.edit_tier : S.add_tier}
        onClose={() => setModal(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setModal(null)}>
              {S.cancel}
            </Btn>
            <Btn variant="primary" onClick={saveTier} disabled={isSaving}>
              {isSaving ? S.saving : S.save}
            </Btn>
          </>
        }
      >
        {serverErrors?.tiers?.length ? (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="error">{serverErrors.tiers[0]}</Notice>
          </div>
        ) : null}

        <div className="admin-form-grid">
          <FormField
            label={S.min_meters}
            id="delivery-min-meters"
            required
            touched={submitted}
            error={
              clientErrors.minDistanceMeters
                ? S.errors[clientErrors.minDistanceMeters]
                : undefined
            }
          >
            <input
              type="number"
              min={0}
              step={1}
              dir="ltr"
              value={draft.minDistanceMeters}
              onChange={(e) => setDraft((d) => ({ ...d, minDistanceMeters: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.max_meters}
            id="delivery-max-meters"
            hint={S.max_meters_hint}
            touched={submitted}
            error={
              clientErrors.maxDistanceMeters
                ? S.errors[clientErrors.maxDistanceMeters]
                : undefined
            }
          >
            <input
              type="number"
              min={0}
              step={1}
              dir="ltr"
              value={draft.maxDistanceMeters}
              onChange={(e) => setDraft((d) => ({ ...d, maxDistanceMeters: e.target.value }))}
            />
          </FormField>

          <FormField
            label={S.fee}
            id="delivery-fee"
            required
            touched={submitted}
            error={clientErrors.fee ? S.errors[clientErrors.fee] : undefined}
          >
            <input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={draft.fee}
              onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))}
            />
          </FormField>
        </div>

        <label className="admin-switch" style={{ marginBlockStart: 16 }}>
          <input
            type="checkbox"
            role="switch"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="admin-switch__track" aria-hidden="true" />
          <span className="admin-switch__label">{S.is_active}</span>
        </label>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        title={S.confirm_delete_title}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmDelete(null)}>
              {S.cancel}
            </Btn>
            <Btn variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {S.delete}
            </Btn>
          </>
        }
      >
        <p>{S.confirm_delete_message}</p>
        {confirmDelete && (
          <strong>
            {formatDistanceRange(
              confirmDelete.min_distance_meters,
              confirmDelete.max_distance_meters,
              S.open_ended,
              S.unit_meters,
            )}
          </strong>
        )}
      </Modal>
    </>
  );
}
