import { Chart } from '@/components/ui/Chart';
import { AsyncBoundary, Card, StatCard } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useAuth } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { relativeTime } from '@/lib/format';
import type { ApiDashboardStats } from '@/api/pharmacyTypes';

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
