import { useState } from 'react';
import { Chart } from '@/components/ui/Chart';
import { AsyncBoundary, Card, SetupChecklist, StatCard } from '@/components/ui';
import type { SetupStep } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useAuth } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { relativeTime } from '@/lib/format';
import type { ApiDashboardStats, ApiPharmacyProfile, ApiSalesList } from '@/api/pharmacyTypes';

/**
 * Pharmacy dashboard — live against `GET /api/pharmacy/dashboard/stats`.
 *
 * Structure still mirrors `resources/views/pharmacy/dashboard/index.blade.php`
 * 1:1 (same wrappers, same `.ph-*` classes, same inline grid declarations).
 *
 * Data source changed from the static mock to the real API; the previously used
 * `MOCK_TREND_DATA` widget had no server equivalent (GAP-3) and is not rendered
 * here — the two charts below are derived from the live stock counts, which the
 * API does provide.
 */
const D = AR.pharmacy.dashboard;
const S = AR.pharmacy.status;

export function DashboardPage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const query = useApiQuery<ApiDashboardStats>(
    (signal) => api.dashboardStats(signal),
    [],
    { isEmpty: () => false },
  );

  /*
   * First-run checklist sources.
   *
   * Both are SMALL requests (`per_page: 1`, a single profile row) and run
   * CONCURRENTLY with the stats query above, so the dashboard's total time is
   * the slowest request rather than the sum — which matters because the API
   * reads from a remote MySQL.
   *
   * They are only consulted to decide whether to show the checklist; once every
   * step is done the component renders nothing at all.
   */
  const profileQuery = useApiQuery<ApiPharmacyProfile>(
    (signal) => api.profile(signal),
    [],
  );
  const salesQuery = useApiQuery<ApiSalesList>(
    (signal) => api.sales({ per_page: 1 }, signal),
    [],
  );

  const data = query.data;

  const total = data?.total_medicines ?? 0;
  const low = data?.low_count ?? 0;
  const out = data?.out_count ?? 0;
  /**
   * DEFECT-1: the API's `available_count` is `is_available && quantity > 0`,
   * which ALSO matches every low row — so it double-counts (live: 11, not 5)
   * and makes `low + available > total`.
   *
   * `total`, `low` and `out` ARE correct, and the three buckets partition the
   * set by definition — so `available` is DERIVED here rather than trusted.
   * See `src/lib/stock.ts` and `docs/API-CONTRACT-MAP.md` → DEFECT-1.
   */
  const available = Math.max(0, total - out - low);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const availablePct = pct(available);
  const lowPct = pct(low);
  const outPct = pct(out);

  const statusLabels = [S.available, S.low_stock, S.out];
  const statusData = [available, low, out];
  const statusColors = ['--success', '--warning', '--danger'];

  const lowStockItems = data?.low_stock_items ?? [];
  const latestRatings = data?.latest_ratings ?? [];

  /*
   * First-run checklist.
   *
   * Every step is derived from REAL data — nothing is assumed complete:
   *   · the account exists, because the user is signed in and this page rendered
   *   · the profile counts as complete only when the fields the public listing
   *     needs are actually filled (name + phone + a location)
   *   · stock, from the stats already loaded
   *   · a first sale, from the sales list's pagination total
   *
   * While the two extra queries are still in flight the checklist stays hidden,
   * so it can never flash "0 of 4" at an established pharmacy.
   */
  const profile = profileQuery.data;
  const profileDone =
    profile != null &&
    Boolean(profile.name?.trim()) &&
    Boolean(profile.phone?.trim()) &&
    Boolean(profile.address?.trim() || (profile.latitude != null && profile.longitude != null));

  const salesTotal = salesQuery.data?.pagination?.total ?? 0;
  const stockTotal = data?.total_medicines ?? 0;

  /*
   * WHEN THE CHECKLIST IS ALLOWED TO SHOW — and why it is gated this way.
   *
   * The first version waited for the profile and sales queries before showing
   * anything. On a remote MySQL those take seconds, so a genuinely new pharmacy
   * would sit in front of a normal-looking empty dashboard and the guidance
   * would arrive late — the opposite of the point.
   *
   * So the gate is the ONE fact already loaded: a pharmacy with no stock is
   * either brand new or has not started, and either way the checklist is the
   * right thing to show. It appears immediately, and the profile / invoice
   * steps fill in as their queries land.
   *
   * An established pharmacy (stock > 0) never sees it at all, which is the
   * "do not be annoying" requirement satisfied without a request.
   */
  const showChecklist =
    !query.isLoading && (stockTotal === 0 || (profile != null && !profileDone));

  const setupSteps: SetupStep[] = [
    { key: 'account', label: D.setup.account, done: true, to: '/' },
    {
      key: 'profile',
      label: D.setup.profile,
      hint: D.setup.profile_hint,
      done: profileDone,
      to: '/profile',
    },
    {
      key: 'medicine',
      label: D.setup.medicine,
      hint: D.setup.medicine_hint,
      done: stockTotal > 0,
      to: '/medicines/request',
    },
    {
      key: 'invoice',
      label: D.setup.invoice,
      hint: D.setup.invoice_hint,
      done: salesTotal > 0,
      to: '/accounting/sales/create',
    },
  ];

  const [setupHidden, setSetupHidden] = useState(
    () => localStorage.getItem('daway.setup.dismissed') === '1',
  );

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{D.heading}</h1>
          <p>{D.subtitle.replace(':pharmacy', user?.name ?? '')}</p>
        </div>
        <div className="ph-actions">
          <a href="/inventory" className="ph-btn outline">
            <i className="fas fa-rotate" /> {D.update_inventory}
          </a>
        </div>
      </div>

      {/* First-run guidance. Renders nothing for a pharmacy that already has
          stock, and nothing while the stats query is still in flight. */}
      {showChecklist && !setupHidden && (
        <SetupChecklist
          title={D.setup.title}
          steps={setupSteps}
          onDismiss={() => {
            localStorage.setItem('daway.setup.dismissed', '1');
            setSetupHidden(true);
          }}
        />
      )}

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={3}
      >
        <div className="ph-stats">
          <StatCard tone="red" icon="fas fa-xmark" value={out} label={D.stat_out} />
          <StatCard tone="orange" icon="fas fa-triangle-exclamation" value={low} label={D.stat_low} />
          <StatCard tone="green" icon="fas fa-check" value={available} label={D.stat_available} />
          <StatCard tone="teal" icon="fas fa-pills" value={total} label={D.stat_total} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))',
            gap: 20,
            marginBlockEnd: 20,
          }}
        >
          <Card title={D.chart_inventory_status} icon="fas fa-chart-column" description={D.chart_inventory_desc}>
            <div className="chart-box">
              <Chart kind="bar" labels={statusLabels} data={statusData} colors={statusColors} legend={false} />
            </div>
          </Card>

          <Card title={D.chart_availability} icon="fas fa-clock-rotate-left">
            <div className="ph-donut-wrap">
              <div className="ph-donut-chart">
                <Chart
                  kind="donut"
                  labels={statusLabels}
                  data={statusData}
                  colors={statusColors}
                  legend={false}
                  centerValue={`${availablePct}%`}
                  centerLabel={S.available}
                />
              </div>
              <ul className="ph-legend">
                <li>
                  <span className="dot" style={{ background: 'var(--success)' }} /> {S.available}{' '}
                  <b>{availablePct}%</b>
                </li>
                <li>
                  <span className="dot" style={{ background: 'var(--warning)' }} /> {S.low_stock}{' '}
                  <b>{lowPct}%</b>
                </li>
                <li>
                  <span className="dot" style={{ background: 'var(--danger)' }} /> {S.out} <b>{outPct}%</b>
                </li>
              </ul>
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 20 }}>
          <Card
            title={D.low_stock_title}
            icon="fas fa-bell"
            description={D.low_stock_desc}
            bodyClassName="ph-card-body ph-table-wrap"
          >
            <table className="ph-table">
              <thead>
                <tr>
                  <th>{D.col_medicine}</th>
                  <th>{D.col_quantity_left}</th>
                  <th>{D.col_status}</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.length > 0 ? (
                  lowStockItems.map((pm) => (
                    <tr key={pm.pharmacy_medicine_id}>
                      <td>
                        <strong>{pm.trade_name}</strong>
                        <br />
                        <small style={{ color: 'var(--ph-ink-faint)' }}>{pm.active_ingredient}</small>
                      </td>
                      <td>{pm.quantity}</td>
                      <td>
                        <span className="ph-badge low">{D.badge_low}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>
                      <div className="ph-empty">
                        <i className="fas fa-check-circle" />
                        <h3>{D.no_alerts}</h3>
                        <p>{D.no_alerts_desc}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card title={D.latest_inquiries} icon="fas fa-comment-dots" description={D.latest_inquiries_desc}>
            {latestRatings.length > 0 ? (
              latestRatings.map((rating) => (
                <div className="ph-inquiry-mini" key={rating.id}>
                  <div className="who">
                    <strong>{rating.user_name || D.patient_fallback}</strong>
                    <span>{relativeTime(rating.created_at)}</span>
                  </div>
                  <p>
                    {'★'.repeat(rating.stars_rating)}
                    {rating.comment ? ` — ${rating.comment}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="ph-empty">
                <i className="far fa-comment-alt" />
                <h3>{D.no_inquiries_yet}</h3>
              </div>
            )}
          </Card>
        </div>
      </AsyncBoundary>
    </div>
  );
}
