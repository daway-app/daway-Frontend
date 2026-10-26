import { useCallback, useEffect, useMemo, useRef, useState } from 'react';import { Link, useNavigate, useParams } from 'react-router-dom';
import { Btn, FormField, LoadingState, Notice, PageHeader } from '@/components/ui';
import { UnsavedChangesGuard } from '@/components/admin/UnsavedChangesGuard';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { toast } from '@/lib/toast';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { thumbUrl } from '@/lib/format';
import type { AdminMedicineDetail, AdminMedicineOption, AdminMedicinesResponse } from '@/api/adminTypes';

/**
 * Admin medicines — create / edit, one screen for both.
 *
 * Mirrors `medicines/create.blade.php` and `medicines/edit.blade.php`, which are
 * near-identical apart from the title, the submit label and the pre-filled
 * values. Rather than duplicate a 200-line form twice, `mode` selects those
 * differences — the same reason the Blade views share a CSS file.
 *
 * THREE REAL DIVERGENCES FROM BLADE, each forced by the medium:
 *
 *  1. **No file input.** The Blade form is `enctype=multipart/form-data` and
 *     uploads bytes via `Cloudinary::upload`. There is no Cloudinary SDK in this
 *     bundle and adding one would ship an API secret to the browser, so the
 *     screen takes the **image URL** instead — which the API accepts as an
 *     alternative (`image`), and which is exactly what an already-uploaded
 *     asset resolves to. The backend prefers real bytes when it gets them, so
 *     the Blade screen keeps working unchanged.
 *
 *  2. **No TomSelect.** Blade loads `tom-select` from a CDN for the
 *     multi-select. The catalogue here is ~18k rows, so enumerating every
 *     option into a `<select>` is not viable at all; instead the alternatives
 *     field is a **search box** over `GET /api/admin/medicines?q=`. That is the
 *     same gap the pharmacy alternative screen documents (the catalogue is
 *     searchable, not enumerable), and the server-side search is the only
 *     honest way to reach it.
 *
 *  3. **`alternatives` is always sent on update.** The API mirrors the web
 *     controller, which calls `detach()` when the key is absent. Sending the
 *     current selection explicitly makes "removed everything" and "left it
 *     alone" distinguishable — without it a save would silently wipe the
 *     alternatives of a medicine whose picker had not finished loading.
 */
export function AdminMedicineFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === 'edit';
  const M = STR.admin.medicines.form;

  const [nameAr, setNameAr] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [altIds, setAltIds] = useState<number[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The values the form was seeded with. `dirty` compares against this so the
   * unsaved-changes guard only fires on real edits — a fresh create form is not
   * "dirty" until the user types.
   */
  const [baseline, setBaseline] = useState({
    nameAr: '',
    ingredient: '',
    description: '',
    image: '',
    altIds: [] as number[],
  });
  /** Flipped immediately before the post-save redirect so the guard does not
   *  intercept its own success navigation (see UnsavedChangesGuard). */
  const allowLeaveRef = useRef(false);

  /* ---- load (edit only) ------------------------------------------------- */
  const detail = useApiQuery<AdminMedicineDetail>(
    (signal) => api.admin.medicine(Number(id), signal),
    [id, isEdit],
    {
      enabled: isEdit && Number.isFinite(Number(id)),
      queryKey: keys.medicines.detail(Number(id)),
    },
  );

  /*
   * Seed the form from the loaded record exactly ONCE.
   *
   * WHY A REF AND NOT A `useEffect([detail.data])`: a refetch (window focus, a
   * retry) would re-run the effect and overwrite whatever the user had typed.
   * The seed must happen on the first successful load only.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!isEdit || seeded.current || !detail.data) return;
    seeded.current = true;
    const d = detail.data;
    setNameAr(d.trade_name ?? '');
    setIngredient(d.active_ingredient ?? '');
    setDescription(d.description ?? '');
    setImage(d.image_url ?? '');
    setAltIds(d.alternative_ids ?? []);
    setBaseline({
      nameAr: d.trade_name ?? '',
      ingredient: d.active_ingredient ?? '',
      description: d.description ?? '',
      image: d.image_url ?? '',
      altIds: d.alternative_ids ?? [],
    });
  }, [isEdit, detail.data]);

  /** True once the user has changed any field away from its seeded value. */
  const dirty =
    nameAr !== baseline.nameAr ||
    ingredient !== baseline.ingredient ||
    description !== baseline.description ||
    image !== baseline.image ||
    altIds.join(',') !== baseline.altIds.join(',');

  /* ---- alternatives search --------------------------------------------- */
  const [altTerm, setAltTerm] = useState('');
  const [altDebounced, setAltDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setAltDebounced(altTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [altTerm]);

  const altQuery = useApiQuery<AdminMedicinesResponse>(
    (signal) => api.admin.medicines({ q: altDebounced, per_page: 20 }, signal),
    [altDebounced],
    {
      enabled: altDebounced.length >= 2,
      queryKey: keys.medicines.list({ q: altDebounced, per_page: 20 }),
    },
  );

  /** Search results, minus this medicine itself — it cannot be its own alternative. */
  const results = useMemo<AdminMedicineOption[]>(() => {
    const selfId = isEdit ? Number(id) : null;
    return (altQuery.data?.medicines ?? [])
      .filter((m) => m.id !== selfId)
      .map((m) => ({ id: m.id, trade_name: m.trade_name }));
  }, [altQuery.data, id, isEdit]);

  /**
   * Names for the currently-selected ids.
   *
   * The detail payload carries `alternatives` (id + trade_name), but anything
   * the user adds during this session only exists as an id, so the name is
   * resolved from the search results. A chip whose name is not resolvable is
   * shown by id rather than dropped — dropping it would hide a real link and
   * make a save quietly destroy data.
   */
  const nameOf = useCallback(
    (medId: number) =>
      detail.data?.alternatives.find((a) => a.id === medId)?.trade_name ??
      results.find((r) => r.id === medId)?.trade_name ??
      `#${medId}`,
    [detail.data, results],
  );

  function toggleAlt(medId: number) {
    setAltIds((prev) =>
      prev.includes(medId) ? prev.filter((v) => v !== medId) : [...prev, medId],
    );
  }

  /* ---- validation + submit --------------------------------------------- */
  const nameError = nameAr.trim() === '' ? M.name_required : null;
  const ingredientError = ingredient.trim() === '' ? M.ingredient_required : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name_ar: true, active_ingredient: true });
    if (nameError || ingredientError) return;

    setSaving(true);
    setError(null);

    const body = {
      name_ar: nameAr.trim(),
      active_ingredient: ingredient.trim(),
      description: description.trim() === '' ? null : description.trim(),
      image: image.trim() === '' ? null : image.trim(),
      alternatives: altIds,
    };

    try {
      if (isEdit) {
        await api.admin.updateMedicine(Number(id), body);
        toast.success(M.updated);
      } else {
        await api.admin.createMedicine(body);
        toast.success(M.created);
      }
      // The save succeeded — this redirect is not a "discard", so let it through.
      allowLeaveRef.current = true;
      navigate(ADMIN_ROUTES.medicines);
    } catch (err) {
      // The server's own Arabic message wins — Laravel localises 422s.
      setError(err instanceof Error && err.message ? err.message : M.save_failed);
    } finally {
      setSaving(false);
    }
  }

  /* ---- render ----------------------------------------------------------- */
  if (isEdit && detail.isLoading) return <LoadingState rows={5} label={M.loading} />;

  const imagePreview = thumbUrl(image, 144, 144);

  return (
    <div className="admin-page">
      {/* Guard the half-filled form: leaving now would discard the edits. */}
      <UnsavedChangesGuard when={() => dirty && !allowLeaveRef.current} />
      <div className="edit-medicine-page-wrapper">
        {/* Was a hand-rolled `.page-heading` (22px title, its own 52px icon
            box). `PageHeader` is the same header every other screen uses. */}
        <PageHeader
          title={isEdit ? M.edit_title.replace('{name}', nameAr || '…') : M.create_title}
          subtitle={STR.admin.medicines.main_description}
          iconChip={<i className={isEdit ? 'fas fa-pen' : 'fas fa-plus'} />}
        />

        {error && (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {/* Card 1 — basic data */}
          <div className="premium-card">
            <div className="card-head">
              <div className="card-head-content">
                <div className="card-icon teal" aria-hidden="true">
                  <i className="fas fa-pills" />
                </div>
                <div>
                  <h2>{M.basic_data}</h2>
                </div>
              </div>
            </div>

            <div className="card-body">
              <div className="form-row">
                <FormField
                  label={M.name_ar_label}
                  id="name_ar"
                  required
                  touched={touched.name_ar}
                  error={nameError}
                >
                  <input
                    type="text"
                    className="fc"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name_ar: true }))}
                    maxLength={255}
                  />
                </FormField>

                <FormField
                  label={M.active_ingredient_label}
                  id="active_ingredient"
                  required
                  touched={touched.active_ingredient}
                  error={ingredientError}
                >
                  <input
                    type="text"
                    className="fc"
                    value={ingredient}
                    onChange={(e) => setIngredient(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, active_ingredient: true }))}
                    maxLength={255}
                  />
                </FormField>
              </div>

              <FormField label={M.description_label} id="description">
                <textarea
                  className="fc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </FormField>

              <FormField label={M.image_label} id="image" hint={M.image_hint}>
                <input
                  type="text"
                  className="fc"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://res.cloudinary.com/…"
                  dir="ltr"
                />
              </FormField>

              {/* The preview is only meaningful once there is a URL to show;
                  an empty box would read as "broken image" instead of "none".

                  ⚠️ NOT `loading="lazy"`: there is exactly ONE thumbnail on
                  this screen, and deferring it means the box sits empty until
                  something else forces a reflow — which reads as a failure to
                  the person who just pasted the URL. A single 72px image is not
                  worth the deferral; the table below still uses lazy. */}
              {imagePreview && (
                <div className="med-image-preview">
                  <img
                    src={imagePreview}
                    alt={nameAr || M.image_label}
                    width={72}
                    height={72}
                    decoding="async"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card 2 — alternatives (search-based) */}
          <div className="premium-card">
            <div className="card-head">
              <div className="card-head-content">
                <div className="card-icon purple" aria-hidden="true">
                  <i className="fas fa-arrows-rotate" />
                </div>
                <div>
                  <h2>{M.alternatives_title}</h2>
                  <p>{M.alternatives_desc}</p>
                </div>
              </div>
            </div>

            <div className="card-body">
              <div className="fg">
                <label className="fl" htmlFor="alt_search">
                  {M.alternatives_placeholder}
                </label>
                <input
                  type="search"
                  id="alt_search"
                  className="fc"
                  value={altTerm}
                  onChange={(e) => setAltTerm(e.target.value)}
                  autoComplete="off"
                  placeholder={M.alternatives_placeholder}
                />
                <p className="ph-field-msg">
                  <i className="fas fa-circle-info" aria-hidden="true" /> {M.search_hint}
                </p>
              </div>

              {altDebounced.length >= 2 && (
                <div className="med-alt-results" role="group" aria-label={M.search_results_label}>
                  {altQuery.isLoading && <p className="med-alt-empty">{STR.admin.common.loading}</p>}
                  {!altQuery.isLoading && results.length === 0 && (
                    <p className="med-alt-empty">{M.search_no_results}</p>
                  )}
                  {results.map((opt) => {
                    const selected = altIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`med-alt-option${selected ? ' is-selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => toggleAlt(opt.id)}
                      >
                        <i
                          className={selected ? 'fas fa-square-check' : 'far fa-square'}
                          aria-hidden="true"
                        />
                        {opt.trade_name}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="med-alt-selected">
                <span className="med-alt-count">
                  {altIds.length > 0
                    ? M.alternatives_selected.replace('{count}', String(altIds.length))
                    : M.alternatives_none}
                </span>
                {altIds.length > 0 && (
                  <ul className="med-alt-chips">
                    {altIds.map((medId) => (
                      <li key={medId}>
                        <button
                          type="button"
                          className="med-alt-chip"
                          onClick={() => toggleAlt(medId)}
                          aria-label={`${STR.admin.common.close} — ${nameOf(medId)}`}
                        >
                          {nameOf(medId)}
                          <i className="fas fa-xmark" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Link to={ADMIN_ROUTES.medicines} className="btn-cancel">
              {M.cancel}
            </Link>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? STR.admin.common.loading : isEdit ? M.edit_submit : M.create_submit}
            </button>
          </div>
        </form>

        {/* A quiet way back for a screen reached by direct URL. */}
        <p className="med-form-back">
          <Btn to={ADMIN_ROUTES.medicines} variant="ghost" size="sm" icon="fas fa-arrow-right">
            {M.back}
          </Btn>
        </p>
      </div>
    </div>
  );
}

