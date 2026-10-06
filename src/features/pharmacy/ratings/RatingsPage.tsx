import { useMemo } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary } from '@/components/ui';
import { usePharmacyApi, useAuth } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { formatDate } from '@/lib/format';
import type { ApiRating } from '@/api/pharmacyTypes';

/**
 * Pharmacy ratings — live against `GET /api/pharmacy/ratings`.
 *
 * Structure still mirrors `resources/views/pharmacy/ratings/index.blade.php`
 * 1:1 (same wrappers, same `.ph-*` classes).
 *
 * GAP-2: the API returns only the rating ROWS (+ pagination). It does NOT send an
 * average, a star histogram, or a trend series. So:
 *   - the average and the 1..5 distribution are DERIVED from the fetched rows,
 *     and are therefore page-scoped (per_page=100) rather than global;
 *   - the trend chart had no server source at all and was removed rather than
 *     faked — showing an invented line on a ratings screen would be misleading.
 * Both facts are recorded in `docs/API-CONTRACT-MAP.md` → GAP-2.
 */
const R = AR.pharmacy.ratings;

/** Blade `$unitLabel = fn($stars) => $stars == 1 ? star : stars`. */
const unitLabel = (stars: number) => (stars === 1 ? R.star : R.stars);

interface Distribution {
  stars: number;
  count: number;
  percent: number;
}

export function RatingsPage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const query = useApiQuery<{ data: ApiRating[] }>(
    (signal) => api.ratings({ per_page: 100 }, signal),
    [],
    { isEmpty: (r) => r.data.length === 0 },
  );

  /** Memoised so the `?? []` fallback does not break downstream memo identity. */
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  const { average, distribution, totalRatings } = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 → 1 star … index 4 → 5 stars
    let sum = 0;

    for (const row of rows) {
      const stars = Math.min(5, Math.max(1, Math.round(row.stars_rating)));
      counts[stars - 1] += 1;
      sum += stars;
    }

    const total = rows.length;
    const dist: Distribution[] = [5, 4, 3, 2, 1].map((stars) => {
      const count = counts[stars - 1];
      return {
        stars,
        count,
        percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });

    return {
      average: total > 0 ? sum / total : 0,
      distribution: dist,
      totalRatings: total,
    };
  }, [rows]);

  const avg = average.toFixed(1);

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{R.heading_page}</h1>
          <p>{R.subtitle.replace(':pharmacy', user?.name ?? '')}</p>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={3}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1.6fr',
            gap: 20,
            marginBlockEnd: 20,
          }}
        >
          <div className="ph-card">
            <div className="ph-card-body" style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '2.6rem',
                  fontWeight: 700,
                  color: 'var(--ph-ink)',
                  lineHeight: 1,
                }}
              >
                {avg}{' '}
                <span
                  style={{
                    fontSize: '1.1rem',
                    color: 'var(--ph-ink-faint)',
                    fontWeight: 600,
                  }}
                >
                  {R.out_of}
                </span>
              </div>
              <div className="ph-stars" style={{ fontSize: '1.3rem', marginBlock: 12 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <i
                    key={i}
                    className={`${i <= Math.round(average) ? 'fas' : 'far'} fa-star`}
                  />
                ))}
              </div>
              <p style={{ color: 'var(--ph-ink-faint)', margin: 0 }}>
                {R.ratings_count.replace(':count', String(totalRatings))}
              </p>
            </div>
          </div>

          <div className="ph-card">
            <div className="ph-card-head">
              <h2>{R.distribution_title}</h2>
            </div>
            <div className="ph-card-body">
              {totalRatings > 0 ? (
                distribution.map((item) => (
                  <div
                    key={item.stars}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBlockEnd: 10 }}
                  >
                    <span style={{ width: 56, fontSize: '.85rem', color: 'var(--ph-ink-soft)' }}>
                      {item.stars} {unitLabel(item.stars)}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        background: 'var(--ph-line-soft)',
                        borderRadius: 'var(--ph-r-full)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${item.percent}%`,
                          height: '100%',
                          background: 'var(--warning)',
                          borderRadius: 'var(--ph-r-full)',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: 70,
                        textAlign: 'end',
                        fontSize: '.8rem',
                        color: 'var(--ph-ink-faint)',
                      }}
                    >
                      {item.count} ({item.percent}%)
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--ph-ink-faint)', margin: 0 }}>{R.empty_comments}</p>
              )}
            </div>
          </div>

          <div className="ph-card">
            <div className="ph-card-head">
              <h2>{R.trend_title}</h2>
            </div>
            <div className="ph-card-body">
              <div className="ph-empty" style={{ padding: 24 }}>
                <i className="fas fa-chart-line" />
                <h3>{R.trend_title}</h3>
                <p>{R.subtitle.replace(':pharmacy', '')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="ph-card">
          <div className="ph-card-head">
            <h2>
              <i className="fas fa-comment-dots" /> {R.latest_title}
            </h2>
          </div>
          <div className="ph-card-body">
            <div className="ph-grid">
              {rows.length > 0 ? (
                rows.map((rating) => (
                  <div key={rating.id} className="ph-rating-card">
                    <div className="head">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="ph-avatar-sm">
                          {(rating.user?.name ?? '').slice(0, 2)}
                        </span>
                        <strong>{rating.user?.name ?? '—'}</strong>
                      </div>
                      <span>{formatDate(rating.created_at)}</span>
                    </div>
                    <div className="ph-stars" style={{ marginBlockEnd: 8 }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <i key={i} className={`${i <= rating.stars_rating ? 'fas' : 'far'} fa-star`} />
                      ))}
                    </div>
                    <p>{rating.comment}</p>
                  </div>
                ))
              ) : (
                <div className="ph-empty" style={{ gridColumn: '1/-1' }}>
                  <i className="far fa-comment-alt" />
                  <h3>{R.empty_comments}</h3>
                </div>
              )}
            </div>
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
