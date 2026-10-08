import { useMemo, useState } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Btn, EmptyState, Modal, Notice } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import type { ApiAlternativeBlock, ApiAlternativeRef } from '@/api/pharmacyTypes';

/**
 * Pharmacy alternatives index — live against `GET /api/pharmacy/alternatives`.
 *
 * Structure still mirrors `resources/views/pharmacy/alternatives/index.blade.php`
 * (accordion via React state, delete confirmation via `Modal`).
 *
 * IMPORTANT — the data model differs from the mock, and the difference is a real
 * backend gap, not a UI choice:
 *
 *   • The API returns ONLY medicines that already have a linked alternative
 *     (`whereHas('medicine.alternatives')`), and it returns only the LINKED
 *     alternatives (`alternatives[]`).
 *   • The mock's `candidates[]` — every medicine that COULD be linked — has no
 *     endpoint at all. There is no "list all medicines" route; only
 *     `GET /api/pharmacy/medicines/search?q=` exists.
 *
 * So the inline "choose alternative" list cannot be reproduced as a static
 * table. It is replaced with a per-row SEARCH that queries the real endpoint,
 * which is the only honest way to offer the same action. See GAP-7 in
 * `docs/API-CONTRACT-MAP.md`.
 *
 * Link / unlink now PERSIST (`POST` / `DELETE`) instead of mutating local state.
 */
const A = AR.pharmacy.alternatives.index;

export function AlternativesPage() {
  const api = usePharmacyApi();

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ baseId: number; cand: ApiAlternativeRef } | null>(
    null,
  );
  /** Per-block search term for the "add an alternative" box. */
  const [search, setSearch] = useState<Record<number, string>>({});
  /** Per-block search results. */
  const [results, setResults] = useState<Record<number, ApiAlternativeRef[]>>({});
  const [searching, setSearching] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Confirmation of the last successful link / unlink. */
  const [notice, setNotice] = useState<string | null>(null);

  const query = useApiQuery<ApiAlternativeBlock[]>(
    (signal) => api.alternatives(signal),
    [],
    { isEmpty: (rows) => rows.length === 0 },
  );

  const blocks = useMemo(() => query.data ?? [], [query.data]);

  const link = useApiMutation((baseId: number, alternativeId: number) =>
    api.addAlternative(baseId, alternativeId),
  );
  const unlink = useApiMutation((baseId: number, alternativeId: number) =>
    api.removeAlternative(baseId, alternativeId),
  );

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (needle === '') return blocks;
    return blocks.filter(
      (b) =>
        (b.medicine?.trade_name ?? '').toLowerCase().includes(needle) ||
        (b.medicine?.active_ingredient ?? '').toLowerCase().includes(needle),
    );
  }, [blocks, needle]);

  const totalAlternatives = blocks.reduce((n, b) => n + b.alternatives.length, 0);
  const needsAlternative = blocks.filter((b) => b.alternatives.length === 0).length;

  const toggle = (id: number) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  /** Search the real medicine catalogue for linkable alternatives. */
  async function runSearch(baseId: number) {
    const term = (search[baseId] ?? '').trim();
    if (term.length < 2) return;
    setSearching(baseId);
    setActionError(null);
    try {
      const found = await api.searchMedicines(term);
      setResults((prev) => ({ ...prev, [baseId]: found }));
    } catch {
      setActionError('تعذّر البحث، حاول مرة أخرى');
    } finally {
      setSearching(null);
    }
  }

  async function doLink(baseId: number, alternativeId: number) {
    setActionError(null);
    setNotice(null);
    try {
      await link.run(baseId, alternativeId);
      // Clear the search, then refetch so the linked row comes from the server.
      setSearch((prev) => ({ ...prev, [baseId]: '' }));
      setResults((prev) => ({ ...prev, [baseId]: [] }));
      query.refetch();
      // Linking used to be completely silent.
      setNotice(A.linked_ok);
    } catch (e) {
      // The API returns Arabic messages for the duplicate / reversed-pair cases.
      setActionError(e instanceof Error ? e.message : 'تعذّر ربط البديل');
    }
  }

  async function confirmUnlink() {
    if (!pending) return;
    setActionError(null);
    setNotice(null);
    try {
      await unlink.run(pending.baseId, pending.cand.id);
      query.refetch();
      // Unlinking used to be completely silent too.
      setNotice(A.unlinked_ok);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'تعذّر حذف البديل');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{A.heading_page}</h1>
          <p>{A.subtitle}</p>
        </div>
        <div className="ph-actions">
          <a href="/alternatives/create" className="ph-btn primary">
            <i className="fas fa-plus" /> {A.add_button}
          </a>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <div className="ph-stats">
          <div className="ph-stat">
            <i className="fas fa-arrows-rotate teal" />
            <div>
              <strong>{totalAlternatives}</strong>
              <span>{A.stat_defined}</span>
            </div>
          </div>
          <div className="ph-stat">
            <i className="fas fa-triangle-exclamation orange" />
            <div>
              <strong>{needsAlternative}</strong>
              <span>{A.stat_need}</span>
            </div>
          </div>
        </div>

        {notice && (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="success">{notice}</Notice>
          </div>
        )}

        {actionError && (
          <div className="ph-error" style={{ marginBlockEnd: 16 }}>
            <i className="fas fa-circle-exclamation" />
            <p>{actionError}</p>
          </div>
        )}

        <form className="ph-filters" onSubmit={(e) => e.preventDefault()}>
          <div className="ph-search" style={{ minWidth: 320 }}>
            <i className="fas fa-search" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={A.search_placeholder}
              autoComplete="off"
            />
          </div>
          {q !== '' && (
            <button type="button" className="ph-btn ghost" onClick={() => setQ('')}>
              <i className="fas fa-xmark" /> {AR.pharmacy.inventory.clear_filters}
            </button>
          )}
        </form>

        {visible.length > 0 ? (
          visible.map((b) => {
            const baseName = b.medicine?.trade_name ?? '—';
            const isOut = b.quantity <= 0;
            const isCollapsed = collapsed[b.id] === true;
            const baseResults = results[b.id] ?? [];
            const linkedIds = new Set(b.alternatives.map((a) => a.id));
            return (
              <div key={b.id} className="ph-card ph-alt-block" style={{ marginBlockEnd: 14 }}>
                <div
                  className="ph-card-head"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  aria-controls={`alt-body-${b.id}`}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => toggle(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(b.id);
                    }
                  }}
                >
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <i className="fas fa-pills" /> {baseName}
                    {isOut && (
                      <span className="ph-badge out" style={{ fontSize: '.7rem' }}>
                        {A.badge_unavailable}
                      </span>
                    )}
                    <span
                      className="ph-alt-count"
                      style={{ fontSize: '.7rem', color: 'var(--ph-ink-faint)', fontWeight: 400 }}
                    >
                      ({b.alternatives.length})
                    </span>
                  </h2>
                  <i
                    className="fas fa-chevron-down ph-toggle-icon"
                    style={{
                      transition: 'transform .2s ease',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>

                {!isCollapsed && (
                  <div
                    className="ph-card-body"
                    id={`alt-body-${b.id}`}
                    style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 22 }}
                  >
                    <div>
                      <div className="ph-alt-detail">
                        <div className="row">
                          <span>{A.detail_ingredient}</span>
                          <strong>{b.medicine?.active_ingredient || '—'}</strong>
                        </div>
                        <div className="row">
                          <span>{A.detail_quantity}</span>
                          <strong style={{ color: isOut ? 'var(--ph-red)' : 'var(--ph-ink)' }}>
                            {b.quantity}
                          </strong>
                        </div>
                        <div className="row">
                          <span>{A.detail_updated}</span>
                          <strong>—</strong>
                        </div>
                      </div>
                      {b.alternatives.length === 0 && (
                        <div className="ph-alt-notice">
                          <i className="fas fa-circle-info" /> {A.no_alternative_notice}
                        </div>
                      )}
                    </div>

                    <div className="ph-table-wrap">
                      <table className="ph-table">
                        <thead>
                          <tr>
                            <th>{A.col_medicine}</th>
                            <th>{A.col_ingredient}</th>
                            <th>{A.col_actions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.alternatives.length > 0 ? (
                            b.alternatives.map((cand) => (
                              <tr key={cand.id} style={{ background: 'rgba(22,163,74,.06)' }}>
                                <td>
                                  <strong>{cand.trade_name ?? '—'}</strong>
                                </td>
                                <td>{cand.active_ingredient ?? '—'}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="ph-btn sm"
                                    style={{
                                      background: 'var(--ph-red)',
                                      color: '#fff',
                                      borderColor: 'var(--ph-red)',
                                      marginInlineStart: 8,
                                    }}
                                    onClick={() => setPending({ baseId: b.id, cand })}
                                  >
                                    <i className="fas fa-trash" /> {A.delete_tooltip}
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3}>
                                <div className="ph-empty" style={{ padding: 24 }}>
                                  <i className="fas fa-box-open" />
                                  <h3>{A.no_candidates}</h3>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {/* GAP-7: there is no candidate-list endpoint, so adding an
                          alternative requires a real search of the catalogue. */}
                      <div style={{ display: 'flex', gap: 8, marginBlockStart: 14 }}>
                        <div className="ph-search" style={{ flex: 1 }}>
                          <i className="fas fa-search" />
                          <input
                            type="search"
                            value={search[b.id] ?? ''}
                            onChange={(e) =>
                              setSearch((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void runSearch(b.id);
                              }
                            }}
                            placeholder={AR.pharmacy.alternatives.create.alternative_placeholder}
                            autoComplete="off"
                          />
                        </div>
                        <button
                          type="button"
                          className="ph-btn outline"
                          disabled={searching === b.id}
                          onClick={() => void runSearch(b.id)}
                        >
                          <i className="fas fa-magnifying-glass" /> {A.choose_alternative}
                        </button>
                      </div>

                      {baseResults.length > 0 && (
                        <table className="ph-table" style={{ marginBlockStart: 10 }}>
                          <tbody>
                            {baseResults
                              .filter((r) => !linkedIds.has(r.id))
                              .map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <strong>{r.trade_name ?? '—'}</strong>
                                  </td>
                                  <td>{r.active_ingredient ?? '—'}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="ph-btn sm outline"
                                      disabled={link.isPending}
                                      onClick={() => void doLink(b.id, r.id)}
                                    >
                                      <i className="fas fa-plus" /> {A.choose_alternative}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /*
            First-use: with no medicines in stock there is nothing to pair, so
            the page is a dead end. It now points at the step that unblocks it.
            (Phase 2.)
          */
          <EmptyState
            icon="fas fa-box-open"
            title={A.empty_medicines}
            action={
              <Btn variant="primary" to="/medicines/request">
                <i className="fas fa-plus" /> {AR.pharmacy.medicines.index.add_medicine}
              </Btn>
            }
          />
        )}

        <Modal
          open={pending !== null}
          title={A.confirm_delete_title}
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="ph-btn ghost" onClick={() => setPending(null)}>
                {A.cancel_button}
              </button>
              <button
                type="button"
                className="ph-btn primary"
                style={{ background: 'var(--ph-red)', color: '#fff', borderColor: 'var(--ph-red)' }}
                disabled={unlink.isPending}
                onClick={() => void confirmUnlink()}
              >
                {A.delete_button}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--ph-ink-soft)', lineHeight: 1.8 }}>
            {A.confirm_delete}
          </p>
        </Modal>

        <p style={{ color: 'var(--ph-ink-faint)', fontSize: '.85rem' }}>{A.footer_note}</p>
      </AsyncBoundary>
    </div>
  );
}
