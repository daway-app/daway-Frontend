import { useMemo, useState } from 'react';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { useAuth } from '@/auth/authHooks';
import type { ApiInventoryItem, ApiSearchableMedicine } from '@/api/pharmacyTypes';

/**
 * Pharmacy alternatives — create. Live against the real endpoints.
 *
 * Faithful port of `resources/views/pharmacy/alternatives/create.blade.php`
 * (CSS family: legacy `edit-medicine-page-wrapper` + `premium-card`).
 *
 * The Blade view is fed two server-side collections — `$pharmacyMedicines` and
 * `$allMedicines`. The API exposes no equivalent "all medicines" collection, so
 * each field uses the closest real endpoint:
 *
 *   • base        → `GET /api/pharmacy/inventory`  (the pharmacy's own stock;
 *                   `store()` validates the id against `pharmacy_medicines`)
 *   • alternative → `GET /api/pharmacy/medicines/search?q=`  (the catalogue is
 *                   searchable but not enumerable — see GAP-7)
 *
 * Submitting now PERSISTS via `POST /api/pharmacy/alternatives`.
 */
const C = AR.pharmacy.alternatives.create;

export function AlternativeCreatePage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const [baseId, setBaseId] = useState('');
  const [altId, setAltId] = useState('');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ApiSearchableMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState(false);

  /** The base dropdown is the pharmacy's own stock — that is what `store()` validates against. */
  const inventory = useApiQuery<{ data: ApiInventoryItem[] }>(
    (signal) => api.inventory({ per_page: 100 }, signal),
    [],
  );
  const baseOptions = useMemo(() => inventory.data?.data ?? [], [inventory.data]);

  const create = useApiMutation((base: number, alternative: number) =>
    api.addAlternative(base, alternative),
  );

  async function runSearch() {
    const q = term.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      setResults(await api.searchMedicines(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    try {
      await create.run(Number(baseId), Number(altId));
      setDone(true);
      setBaseId('');
      setAltId('');
      setTerm('');
      setResults([]);
    } catch {
      // `create.error` renders below.
    }
  }

  return (
    <div className="edit-medicine-page-wrapper">
      <div className="page-heading">
        <div className="page-heading-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </div>
        <div>
          <h1>{C.heading.replace(':pharmacy', user?.name ?? '')}</h1>
          <p>{C.card_title}</p>
        </div>
      </div>

      <div className="premium-card">
        <div className="card-head">
          <div className="card-head-content">
            <div className="card-icon teal">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h2>{C.card_title}</h2>
            </div>
          </div>
        </div>

        <div className="card-body">
          {done && (
            <div
              className="ph-alt-notice"
              style={{ marginBlockEnd: 16, color: 'var(--ph-green, #16a34a)' }}
            >
              <i className="fas fa-circle-check" /> تم ربط الدواء البديل بنجاح
            </div>
          )}

          {create.error && (
            <div className="ph-error" style={{ marginBlockEnd: 16 }}>
              <i className="fas fa-circle-exclamation" />
              <p>{create.error.message}</p>
            </div>
          )}

          <form action="#" method="POST" onSubmit={submit}>
            <div className="fg">
              <label className="fl" htmlFor="base_medicine_id">
                {C.base_label} <span className="req">*</span>
              </label>
              <select
                name="base_medicine_id"
                id="base_medicine_id"
                className="fc"
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                disabled={inventory.isLoading}
                required
              >
                <option value="">
                  {inventory.isLoading ? '...جارٍ التحميل' : C.base_placeholder}
                </option>
                {baseOptions.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.medicine?.trade_name ?? '—'} ({pm.medicine?.active_ingredient ?? '—'})
                  </option>
                ))}
              </select>
            </div>

            {/* GAP-7: the catalogue is searchable, not enumerable. */}
            <div className="fg">
              <label className="fl" htmlFor="alternative_search">
                {C.alternative_label} <span className="req">*</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="search"
                  id="alternative_search"
                  className="fc"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runSearch();
                    }
                  }}
                  placeholder={C.alternative_placeholder}
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={searching}
                  onClick={() => void runSearch()}
                >
                  <i className="fas fa-magnifying-glass" /> بحث
                </button>
              </div>

              <select
                name="alternative_medicine_id"
                id="alternative_medicine_id"
                className="fc"
                style={{ marginBlockStart: 10 }}
                value={altId}
                onChange={(e) => setAltId(e.target.value)}
                required
              >
                <option value="">
                  {results.length === 0 ? C.alternative_placeholder : 'اختر من النتائج'}
                </option>
                {results.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.trade_name ?? '—'} ({m.active_ingredient ?? '—'})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-actions">
              <a href="/alternatives" className="btn-cancel">
                {C.cancel_button}
              </a>
              <button
                type="submit"
                className="btn-submit"
                disabled={create.isPending || !baseId || !altId}
              >
                {C.add_button}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
