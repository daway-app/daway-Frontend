import { useMemo, useState } from 'react';
import { labelOf } from '@/lib/i18n';
import { useLang } from '@/lib/lang/useLang';
import { useUrlState } from '@/lib/urlState';
import { AsyncBoundary, Btn, EmptyState, Modal } from '@/components/ui';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import type { ApiCashMovement, ApiCashStats } from '@/api/pharmacyTypes';
import {
  buildCashAdjustmentBody,
  resolveAdjustmentDirection,
  type AdjustmentFieldError,
  type CashAdjustmentKind,
  type CashAdjustmentResult,
  type CashDirection,
} from './cashAdjustment';

/**
 * Cash register — live against `GET /api/pharmacy/accounting/cash` and
 * `POST /api/pharmacy/accounting/cash/adjustments`.
 *
 * Port of `pharmacy/accounting/cash/index.blade.php`.
 *
 * The balance is read from the server's `stats.balance_now`, which is computed
 * from the ledger — it can never disagree with the table, matching Blade's own
 * stated intent («الرصيد الحقيقي — لا رقم مكتوب يدويًا»).
 *
 * ✅ This wiring also REMOVES a Blade defect that the mock version had to
 * document: the Blade page paginates BEFORE applying its filters, so the table
 * showed unfiltered rows. Filtering now happens in SQL (`source_type`,
 * `direction` are query params), i.e. before pagination — which is what the
 * filter bar always promised. The divergence note is therefore obsolete.
 *
 * `source_type` is a raw machine key; the label comes from
 * `AR.accounting.cash_registers.types` via `labelOf` (which falls back to the
 * key, so a new backend enum value shows a readable token instead of blank).
 *
 * ✅ "Record cash movement" is wired to the backend's adjustments endpoint
 * (deposit / withdrawal / adjustment, mandatory reason). Direction is derived
 * client-side for deposit/withdrawal (mirroring the controller's consistency
 * check), the movement runs behind a confirmation step, and the REAL result
 * (new balance + the server's negative-balance warning) is shown afterwards.
 */


const DIRECTIONS = ['all', 'in', 'out'] as const;
type DirectionKey = (typeof DIRECTIONS)[number];

/**
 * The filter options the backend understands.
 *
 * Mirrors the keys of `AR.accounting.cash_registers.types` (and the
 * `source_type` values written by `AccountingLedger`).
 */
const SOURCE_TYPES = [
  'sale',
  'purchase',
  'expense',
  'customer_payment',
  'supplier_payment',
  'withdrawal',
  'deposit',
  'adjustment',
  'refund',
] as const;

const PER_PAGE = 25;

export function AccountingCashPage() {
  const { STR } = useLang();
  const A = STR.accounting;
  const DIRECTION_LABELS: Record<DirectionKey, string> = {
    all: A.common.all,
    in: A.cash_registers.incoming,
    out: A.cash_registers.outgoing,
  };
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();

  // Phase 3: filters + pagination in the URL (shareable, back/forward-safe).
  const { state, set } = useUrlState({
    source: { key: 'source', parse: String, serialize: String, default: 'all' },
    direction: { key: 'direction', parse: String, serialize: String, default: 'all' },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  const sourceType = state.source as string;
  const setSourceType = (value: string) => set({ source: value, page: 1 });
  const direction = state.direction as DirectionKey;
  const setDirection = (value: DirectionKey) => set({ direction: value, page: 1 });
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };

  const cashParams = {
    per_page: PER_PAGE,
    page,
    ...(sourceType !== 'all' ? { source_type: sourceType } : {}),
    ...(direction !== 'all' ? { direction } : {}),
  };

  const query = useApiQuery<{
    data: ApiCashMovement[];
    stats: ApiCashStats;
    period: { from: string; to: string };
    pagination: { current_page: number; last_page: number; total: number };
  }>(
    (signal) => api.cash(cashParams, signal),
    [sourceType, direction, page],
    { queryKey: keys.cash(cashParams), isEmpty: (r) => r.data.length === 0 },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const stats = query.data?.stats;
  const pagination = query.data?.pagination;

  const hasFilters = sourceType !== 'all' || direction !== 'all';

  // ── Record cash movement (POST …/cash/adjustments) ────────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustStep, setAdjustStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [adjustKind, setAdjustKind] = useState<CashAdjustmentKind>('deposit');
  const /** only consulted for `adjustment` — deposit/withdrawal derive theirs */
    [adjustDirectionValue, setAdjustDirectionValue] = useState<CashDirection | ''>('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustFieldErrors, setAdjustFieldErrors] = useState<AdjustmentFieldError[]>([]);
  const [adjustResult, setAdjustResult] = useState<CashAdjustmentResult | null>(null);

  const adjust = useApiMutation((body: Parameters<typeof api.cashAdjustment>[0]) =>
    api.cashAdjustment(body),
  );

  function openAdjustment() {
    setAdjustOpen(true);
    setAdjustStep('form');
    setAdjustKind('deposit');
    setAdjustDirectionValue('');
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustFieldErrors([]);
    setAdjustResult(null);
    adjust.reset();
  }

  function closeAdjustment() {
    if (adjust.isPending) return;
    setAdjustOpen(false);
    setAdjustStep('form');
    setAdjustFieldErrors([]);
    setAdjustResult(null);
    adjust.reset();
  }

  function reviewAdjustment() {
    const outcome = buildCashAdjustmentBody({
      kind: adjustKind,
      amount: Number(adjustAmount),
      reason: adjustReason,
      // Raw — an empty direction for `adjustment` must be REPORTED, not masked.
      direction: adjustDirectionValue as CashDirection,
    });
    if (!outcome.ok) {
      setAdjustFieldErrors(outcome.errors);
      return;
    }
    setAdjustFieldErrors([]);
    setAdjustStep('confirm');
  }

  async function runAdjustment() {
    const outcome = buildCashAdjustmentBody({
      kind: adjustKind,
      amount: Number(adjustAmount),
      reason: adjustReason,
      direction: adjustDirectionValue as CashDirection,
    });
    if (!outcome.ok) {
      setAdjustFieldErrors(outcome.errors);
      setAdjustStep('form');
      return;
    }
    try {
      const res = await adjust.run(outcome.body);
      setAdjustResult(res);
      setAdjustStep('done');
      void query.refetch();
    } catch {
      setAdjustStep('form');
    }
  }

  const hasAdjustFieldError = (field: AdjustmentFieldError) =>
    adjustFieldErrors.includes(field) || adjust.fieldErrors?.[field] !== undefined;

  /** Any filter change resets to page 1, or the user lands on an empty page. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{A.cash_registers.title}</h1>
          <p className="subtitle">{A.cash_registers.subtitle}</p>
        </div>
        <div className="ph-actions">
          <Btn variant="primary" onClick={openAdjustment}>
            <i className="fas fa-cash-register" aria-hidden="true" />{' '}
            {A.cash_registers.record_movement}
          </Btn>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={5}
      >
        <div className="ph-card ac-balance-card">
          <span className="label">{A.cash_registers.balance_now}</span>
          <span className="value ac-num">{money(stats?.balance_now ?? 0)}</span>
          {stats?.is_low && (
            <span className="ph-badge out" style={{ marginInlineStart: 12 }}>
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
              {A.overview.alert_low_cash}
            </span>
          )}
        </div>

        <div className="ph-filters ac-filters">
          <form onSubmit={(e) => e.preventDefault()}>
            <select
              value={sourceType}
              onChange={(e) => changeFilter(() => setSourceType(e.target.value))}
              aria-label={A.common.type}
            >
              <option value="all">{A.common.all}</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {A.cash_registers.types[s]}
                </option>
              ))}
            </select>

            <select
              value={direction}
              onChange={(e) => changeFilter(() => setDirection(e.target.value as DirectionKey))}
              aria-label={A.common.direction}
            >
              {DIRECTIONS.map((k) => (
                <option key={k} value={k}>
                  {DIRECTION_LABELS[k]}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="ph-btn outline"
              disabled={query.isRefetching}
              onClick={() => query.refetch()}
            >
              {A.common.apply}
            </button>

            {hasFilters ? (
              <button
                type="button"
                className="ph-btn"
                onClick={() =>
                  changeFilter(() => {
                    setSourceType('all');
                    setDirection('all');
                  })
                }
              >
                {A.common.clear_filters}
              </button>
            ) : null}
          </form>
        </div>

        {rows.length === 0 ? (
          /*
            An empty cash register is filled by sales, so the one action that
            resolves it is "new sale" — a real next step, not decoration.
            (Phase 2 — item A. Reuses the existing `new_sale` label.)
          */
          <EmptyState
            icon="fas fa-wallet"
            title={A.cash_registers.empty}
            description={A.cash_registers.empty_desc}
            action={
              <Btn variant="primary" to={ROUTES.accountingSalesCreate}>
                <i className="fas fa-plus" /> {A.sales.new_sale}
              </Btn>
            }
          />
        ) : (
          <>
            {/* 🔴 إصلاح React: غلاف تمرير أفقي (Blade يرسم الجدول عاريًا). */}
            <div className="ph-table-wrap">
              <table className="ph-table">
                <caption className="ac-hidden">{A.cash_registers.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{A.common.date}</th>
                    <th scope="col">{A.payment_types.type}</th>
                    <th scope="col">{A.common.direction}</th>
                    <th scope="col">{A.common.amount}</th>
                    <th scope="col">{A.common.description}</th>
                    <th scope="col">{A.common.user}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.date_human ?? m.date ?? '—'}</td>
                      <td>{labelOf(A.cash_registers.types, m.source_type)}</td>
                      <td>
                        <span
                          className={`ph-badge ${m.direction === 'in' ? 'income' : 'expense'}`}
                        >
                          {A.cash_registers.direction[m.direction]}
                        </span>
                      </td>
                      {/* `signed_amount` carries the sign; `amount` is the magnitude. */}
                      <td className={`ac-num ${m.signed_amount < 0 ? 'ac-neg' : ''}`}>
                        {m.signed_amount < 0 ? '−' : ''}
                        {money(Math.abs(m.amount))}
                      </td>
                      <td className="ac-muted">{m.description ?? m.reason ?? '—'}</td>
                      <td className="ac-muted">{m.created_by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(pagination?.last_page ?? 1) > 1 && (
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="fas fa-chevron-right" aria-hidden="true" /> {A.common.previous}
                </button>
                <span className="ac-muted">
                  {page} / {pagination?.last_page}
                </span>
                <button
                  type="button"
                  className="ph-btn ghost sm"
                  disabled={page >= (pagination?.last_page ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {A.common.next} <i className="fas fa-chevron-left" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </AsyncBoundary>

      <Modal
        open={adjustOpen}
        title={A.cash_registers.record_movement}
        onClose={closeAdjustment}
        footer={
          adjustStep === 'form' ? (
            <>
              <button type="button" className="ph-btn ghost" onClick={closeAdjustment}>
                {A.common.cancel}
              </button>
              <button
                type="button"
                className="ph-btn primary"
                onClick={reviewAdjustment}
              >
                {A.common.apply}
              </button>
            </>
          ) : adjustStep === 'confirm' ? (
            <>
              <button
                type="button"
                className="ph-btn ghost"
                onClick={() => setAdjustStep('form')}
              >
                {A.common.back}
              </button>
              <button
                type="button"
                className="ph-btn danger"
                disabled={adjust.isPending}
                onClick={() => void runAdjustment()}
              >
                {adjust.isPending
                  ? A.common.processing
                  : A.cash_registers.confirm_action}
              </button>
            </>
          ) : (
            <button type="button" className="ph-btn primary" onClick={closeAdjustment}>
              {A.common.close}
            </button>
          )
        }
      >
        {adjustStep === 'form' && (
          <>
            {adjust.error && (
              <div className="ph-error" style={{ marginBlockEnd: 14 }}>
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                <p>{adjust.error.message}</p>
              </div>
            )}

            <div className="ph-form-group">
              <label htmlFor="ac-adj-kind">{A.common.type}</label>
              <select
                id="ac-adj-kind"
                className="ph-select"
                value={adjustKind}
                onChange={(e) => {
                  setAdjustKind(e.target.value as CashAdjustmentKind);
                  setAdjustFieldErrors((prev) => prev.filter((f) => f !== 'direction'));
                }}
              >
                <option value="deposit">{A.cash_registers.types.deposit}</option>
                <option value="withdrawal">{A.cash_registers.types.withdrawal}</option>
                <option value="adjustment">{A.cash_registers.types.adjustment}</option>
              </select>
            </div>

            {adjustKind === 'adjustment' && (
              <div className="ph-form-group">
                <label htmlFor="ac-adj-direction">{A.common.direction}</label>
                <select
                  id="ac-adj-direction"
                  className="ph-select"
                  value={adjustDirectionValue}
                  aria-invalid={hasAdjustFieldError('direction')}
                  onChange={(e) => {
                    setAdjustDirectionValue(e.target.value as CashDirection | '');
                    setAdjustFieldErrors((prev) => prev.filter((f) => f !== 'direction'));
                  }}
                >
                  <option value="">—</option>
                  <option value="in">{A.cash_registers.direction.in}</option>
                  <option value="out">{A.cash_registers.direction.out}</option>
                </select>
                {hasAdjustFieldError('direction') && (
                  <p className="ph-hint" role="alert">
                    {adjust.fieldErrors?.direction?.[0] ?? A.cash_registers.err_direction}
                  </p>
                )}
              </div>
            )}

            <div className="ph-form-group">
              <label htmlFor="ac-adj-amount">{A.common.amount}</label>
              <input
                type="number"
                id="ac-adj-amount"
                className="ph-input"
                min={0}
                step={0.01}
                value={adjustAmount}
                aria-invalid={hasAdjustFieldError('amount')}
                onChange={(e) => {
                  setAdjustAmount(e.target.value);
                  setAdjustFieldErrors((prev) => prev.filter((f) => f !== 'amount'));
                }}
              />
              {hasAdjustFieldError('amount') && (
                <p className="ph-hint" role="alert">
                  {adjust.fieldErrors?.amount?.[0] ?? A.cash_registers.err_amount}
                </p>
              )}
            </div>

            <div className="ph-form-group">
              <label htmlFor="ac-adj-reason">{A.cash_registers.movement_reason_label}</label>
              <textarea
                id="ac-adj-reason"
                rows={3}
                className="ph-textarea"
                placeholder={A.cash_registers.movement_reason_placeholder}
                value={adjustReason}
                aria-invalid={hasAdjustFieldError('reason')}
                onChange={(e) => {
                  setAdjustReason(e.target.value);
                  setAdjustFieldErrors((prev) => prev.filter((f) => f !== 'reason'));
                }}
              />
              {hasAdjustFieldError('reason') && (
                <p className="ph-hint" role="alert">
                  {adjust.fieldErrors?.reason?.[0] ?? A.cash_registers.err_reason}
                </p>
              )}
            </div>

            <p className="ph-hint">{A.cash_registers.confirm_hint}</p>
          </>
        )}

        {adjustStep === 'confirm' && (
          <>
            <p className="ph-hint">{A.cash_registers.confirm_hint}</p>
            <div className="ph-grid">
              <div className="ph-grid-item">
                <span className="label">{A.common.type}</span>
                <span className="value">{A.cash_registers.types[adjustKind]}</span>
              </div>
              <div className="ph-grid-item">
                <span className="label">{A.common.direction}</span>
                <span className="value">
                  {
                    A.cash_registers.direction[
                      resolveAdjustmentDirection(
                        adjustKind,
                        adjustDirectionValue as CashDirection,
                      ) as CashDirection
                    ]
                  }
                </span>
              </div>
              <div className="ph-grid-item">
                <span className="label">{A.common.amount}</span>
                <span className="value ac-strong">{money(Number(adjustAmount))}</span>
              </div>
              <div className="ph-grid-item">
                <span className="label">{A.cash_registers.movement_reason_label}</span>
                <span className="value" dir="auto">
                  {adjustReason.trim()}
                </span>
              </div>
            </div>
          </>
        )}

        {adjustStep === 'done' && adjustResult && (
          <>
            <p className="ph-hint">{A.cash_registers.success}</p>
            <p className="ph-hint">
              {A.cash_registers.new_balance.replace(
                ':balance',
                money(adjustResult.balance_now),
              )}
            </p>
            {adjustResult.warning && (
              <div className="ph-error" style={{ marginBlockStart: 10 }}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                <p>{adjustResult.warning}</p>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

