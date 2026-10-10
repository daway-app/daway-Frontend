import { useState } from 'react';
import { AsyncBoundary, Badge, Card, PageHeader, StatCard } from '@/components/ui';
import { Chart } from '@/components/ui/Chart';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { timeAgo, tpl } from '../shared';
import type { AdminDashboardResponse } from '@/api/adminTypes';

/**
 * Admin dashboard.
 *
 * Mirrors `resources/views/dashboard/index.blade.php`: four stat cards, one
 * multi-series activity chart with a filter, and a recent-activity feed.
 *
 * Divergences from Blade, all intentional:
 *
 *  1. **The server sends no translated text.** Blade's controller calls `__()`
 *     to build dataset labels and activity sentences. Doing that over the API
 *     would bake the server's locale into the payload, so switching language
 *     would require a round-trip. Here the server sends a machine `key` and raw
 *     `role`/`created_at`, and this file composes the Arabic.
 *  2. **`topPharmacies` is not fetched.** Blade computes it and then never
 *     renders it (dead data, confirmed in the inventory report).
 *  3. **The four filter pills switch DATASETS**, not visibility of pre-rendered
 *     canvases. Blade draws four charts and toggles them with `hidden`; React
 *     draws the selected series once, which is cheaper and avoids four live
 *     canvases.
 */
export function AdminDashboardPage() {
  const api = useAdminApi();
  const [filter, setFilter] = useState<'all' | 'searches' | 'patients' | 'pharmacies'>('all');

  const query = useApiQuery<AdminDashboardResponse>(
    (signal) => api.admin.dashboard(signal),
    [],
  );

  const data = query.data;
  const stats = data?.stats;
  const D = AR.admin.dashboard;

  const dataset = stats?.chartData.datasets[filter];

  const filterLabels: Record<typeof filter, string> = {
    all: D.filter_all,
    searches: D.filter_searches,
    patients: D.filter_patients,
    pharmacies: D.filter_pharmacies,
  };

  return (
    <>
      <PageHeader
        title={D.title}
        subtitle={D.subtitle}
        icon="fas fa-chart-line"
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        {stats && (
          <>
            <div className="ph-stats-grid">
              <StatCard
                tone="blue"
                icon="fas fa-users"
                value={stats.totalPatients.toLocaleString('ar-EG')}
                label={D.total_patients}
              />
              <StatCard
                tone="green"
                icon="fas fa-store"
                value={stats.activePharmacies.toLocaleString('ar-EG')}
                label={D.active_pharmacies}
              />
              <StatCard
                tone="teal"
                icon="fas fa-pills"
                value={stats.totalMedicines.toLocaleString('ar-EG')}
                label={D.total_medicines}
              />
              <StatCard
                tone="orange"
                icon="fas fa-calendar-plus"
                value={stats.newPharmaciesThisWeek.toLocaleString('ar-EG')}
                label={D.new_this_week}
              />
            </div>

            <div className="ph-charts-row">
              <Card
                title={D.platform_activity}
                icon="fas fa-chart-bar"
                headExtra={
                  <div className="ph-pills">
                    {(['all', 'searches', 'patients', 'pharmacies'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`ph-pill${filter === key ? ' active' : ''}`}
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                      >
                        {filterLabels[key]}
                      </button>
                    ))}
                  </div>
                }
              >
                {dataset && (
                  <>
                    <Chart
                      kind="bar"
                      labels={stats.chartData.labels}
                      data={dataset.values}
                      colors={[dataset.color]}
                      legend={false}
                    />
                    <div className="ph-chart-summary">
                      <span>
                        {AR.admin.common.results.replace('{count}', String(dataset.total))}
                      </span>
                      {dataset.change !== null && (
                        <Badge variant={dataset.change >= 0 ? 'ok' : 'out'}>
                          {dataset.change >= 0 ? '▲' : '▼'} {Math.abs(dataset.change)}%
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </Card>

              <Card title={D.recent_activities} icon="fas fa-clock">
                {data.recent_activities.length === 0 ? (
                  <p className="ph-muted">{D.no_activities}</p>
                ) : (
                  <ul className="ph-activity-feed">
                    {data.recent_activities.map((activity, index) => (
                      <li key={`${activity.created_at}-${index}`}>
                        <span
                          className="ph-activity-dot"
                          style={{
                            background: activity.role === 'pharmacy' ? '#10b981' : '#3b82f6',
                          }}
                          aria-hidden="true"
                        />
                        <div>
                          <p>
                            {activity.role === 'pharmacy'
                              ? tpl(D.activity_pharmacy_joined, { name: activity.name })
                              : tpl(D.activity_patient_registered, { name: activity.name })}
                          </p>
                          <time dateTime={activity.created_at}>
                            {timeAgo(activity.created_at)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card title={D.total_medicines} icon="fas fa-capsules">
              <ul className="ph-activity-feed">
                <li>
                  <span className="ph-activity-dot" style={{ background: '#10b981' }} aria-hidden="true" />
                  <div>
                    <p>
                      {D.stock_available}: <strong>{stats.stockStatus.available}</strong>
                    </p>
                  </div>
                </li>
                <li>
                  <span className="ph-activity-dot" style={{ background: '#f59e0b' }} aria-hidden="true" />
                  <div>
                    <p>
                      {D.stock_low}: <strong>{stats.stockStatus.low_stock}</strong>
                    </p>
                  </div>
                </li>
                <li>
                  <span className="ph-activity-dot" style={{ background: '#ef4444' }} aria-hidden="true" />
                  <div>
                    <p>
                      {D.stock_out}: <strong>{stats.stockStatus.out_of_stock}</strong>
                    </p>
                  </div>
                </li>
              </ul>
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
