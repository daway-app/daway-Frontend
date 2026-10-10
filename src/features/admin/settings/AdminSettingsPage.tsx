import { useEffect, useMemo, useState } from 'react';
import { AsyncBoundary, Badge, Btn, Card, Notice, PageHeader } from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { num } from '../shared';
import type { AdminSettingsResponse } from '@/api/adminTypes';

/**
 * Admin settings — the platform configuration form.
 *
 * ============================================================================
 * 🔴 THE CHECKBOX DEFECT THIS FIXES
 * ============================================================================
 * The Blade panel cannot turn a checkbox **off**. A browser sends nothing for an
 * unchecked box, and the controller's `only([...])` drops absent keys — so the
 * stored `1` survives every save and the setting is permanently stuck on. This
 * is an inherited, documented defect (see the controller's own comment), and it
 * is fixed on the client side by a single rule:
 *
 *     **Every key is sent explicitly on save — booleans as real `true`/`false`,
 *     never omitted.**
 *
 * That is why `buildPayload()` below enumerates all keys from a fixed schema
 * rather than diffing against the loaded values. A diff would reintroduce the
 * bug the moment a user toggled a switch twice, and omitting a false value is
 * exactly the failure being fixed.
 *
 * ============================================================================
 * SCHEMA-DRIVEN, NOT HAND-WRITTEN PER FIELD
 * ============================================================================
 * The backend accepts a fixed `$allowed` list (`LogSettingController`). Declaring
 * the same list here as data means:
 *   · a new setting is one array entry, not three (state, input, payload);
 *   · the four tabs are a grouping over the same list;
 *   · the payload can never drift from the schema.
 *
 * Booleans are `type: 'toggle'` and are stored as `'1'`/`'0'` on the server, so
 * the initial value is parsed with `=== '1'` (never truthiness — `'0'` is a
 * truthy string and would render every switch as ON).
 */
type FieldKind = 'text' | 'textarea' | 'email' | 'tel' | 'number' | 'select' | 'toggle';

interface FieldSpec {
  key: string;
  /** The i18n leaf key under `AR.admin.settings`, resolved at render time. */
  labelKey: keyof typeof AR.admin.settings;
  kind: FieldKind;
  /** Which tab the field appears on. */
  tab: SettingsTab;
  options?: { value: string; label: string }[];
}

type SettingsTab = 'general' | 'pharmacies' | 'notifications' | 'security';

/**
 * The form schema — module scope, deliberately.
 *
 * This array is a CONSTANT: it mirrors the backend's `$allowed` list and does not
 * depend on props, state, or the i18n bundle's identity. It is defined here
 * rather than inside the component for one concrete reason: a fresh array on
 * every render makes `useMemo([...])` and `useEffect([...])` re-run on every
 * render, which for the effect below would re-seed the form and wipe whatever
 * the user had typed.
 *
 * `labelKey` (not `label`) keeps the translation lookup at render time, so the
 * schema stays language-independent and there is no second source of truth.
 */
const FIELDS: FieldSpec[] = [
  { key: 'site_name', labelKey: 'site_name', kind: 'text', tab: 'general' },
  { key: 'site_description', labelKey: 'site_description', kind: 'textarea', tab: 'general' },
  { key: 'support_email', labelKey: 'support_email', kind: 'email', tab: 'general' },
  { key: 'support_phone', labelKey: 'support_phone', kind: 'tel', tab: 'general' },
  { key: 'default_language', labelKey: 'default_language', kind: 'select', tab: 'general' },
  { key: 'maintenance_mode', labelKey: 'maintenance_mode', kind: 'toggle', tab: 'general' },

  { key: 'auto_approve_pharmacies', labelKey: 'auto_approve_pharmacies', kind: 'toggle', tab: 'pharmacies' },
  { key: 'show_inactive_pharmacies', labelKey: 'show_inactive_pharmacies', kind: 'toggle', tab: 'pharmacies' },
  { key: 'max_search_radius', labelKey: 'max_search_radius', kind: 'number', tab: 'pharmacies' },
  { key: 'search_limit', labelKey: 'search_limit', kind: 'number', tab: 'pharmacies' },

  { key: 'email_notifications', labelKey: 'email_notifications', kind: 'toggle', tab: 'notifications' },
  { key: 'notify_low_stock', labelKey: 'notify_low_stock', kind: 'toggle', tab: 'notifications' },

  { key: 'session_timeout', labelKey: 'session_timeout', kind: 'number', tab: 'security' },
];

const TABS: { key: SettingsTab; labelKey: keyof typeof AR.admin.settings }[] = [
  { key: 'general', labelKey: 'tab_general' },
  { key: 'pharmacies', labelKey: 'tab_pharmacies' },
  { key: 'notifications', labelKey: 'tab_notifications' },
  { key: 'security', labelKey: 'tab_security' },
];

export function AdminSettingsPage() {
  const api = useAdminApi();
  const S = AR.admin.settings;

  const [tab, setTab] = useState<SettingsTab>('general');
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});

  const query = useApiQuery<AdminSettingsResponse>(
    (signal) => api.admin.settings(signal),
    [],
  );

  const settings = query.data?.settings;

  /**
   * Seed the draft from the server values.
   *
   * Runs on every successful load (including after a save-triggered refetch) so
   * the form always reflects what the server actually holds. Booleans are parsed
   * against `'1'` explicitly — see the note about `'0'` being truthy.
   */
  useEffect(() => {
    if (!settings) return;
    const next: Record<string, string | boolean> = {};
    for (const field of FIELDS) {
      const raw = settings[field.key] ?? '';
      next[field.key] = field.kind === 'toggle' ? raw === '1' : raw;
    }
    setDraft(next);
  }, [settings]);

  const saveMutation = useApiMutation(async (payload: Record<string, unknown>) =>
    api.admin.updateSettings(payload),
  );

  /** Build the payload — EVERY key, explicitly. This is the bug fix. */
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const field of FIELDS) {
      const value = draft[field.key];
      if (field.kind === 'toggle') {
        // A real boolean, both ways. Never omitted when false.
        payload[field.key] = value === true;
      } else {
        payload[field.key] = value ?? '';
      }
    }
    return payload;
  }

  async function handleSave() {
    try {
      await saveMutation.run(buildPayload());
      toast.success(S.saved);
      query.refetch();
    } catch {
      toast.error('تعذّر حفظ الإعدادات، حاول مرة أخرى.');
    }
  }

  const visibleFields = useMemo(() => FIELDS.filter((f) => f.tab === tab), [tab]);

  return (
    <>
      <PageHeader
        title={S.title}
        subtitle={AR.admin.nav.system_settings}
        icon="fas fa-gear"
        actions={
          <Btn variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
            <i className="fas fa-floppy-disk" /> {saveMutation.isPending ? S.saving : S.save}
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
            <Notice tone="info">{S.saved_hint}</Notice>

            <Card
              headExtra={
                <div className="ph-pills" role="tablist" aria-label={S.title}>
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      className={`ph-pill${tab === t.key ? ' active' : ''}`}
                      onClick={() => setTab(t.key)}
                    >
                      {S[t.labelKey]}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="admin-form-grid">
                {visibleFields.map((field) => (
                  <SettingField
                    key={field.key}
                    field={field}
                    label={S[field.labelKey]}
                    options={
                      field.kind === 'select'
                        ? [
                            { value: 'ar', label: S.language_ar },
                            { value: 'en', label: S.language_en },
                          ]
                        : undefined
                    }
                    value={draft[field.key]}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, [field.key]: value }))
                    }
                  />
                ))}
              </div>
            </Card>

            {/* MOH catalogue status — read-only facts, not editable settings. */}
            <Card title={S.catalog_title} icon="fas fa-database">
              <dl className="admin-detail-list admin-detail-list--static">
                <li>
                  <div>
                    <strong>{S.catalog_count}</strong>
                    <span className="admin-muted">{num(query.data.catalog_count).toLocaleString('ar-EG')}</span>
                  </div>
                </li>
                <li>
                  <div>
                    <strong>{S.catalog_size}</strong>
                    <span className="admin-muted">
                      {query.data.catalog_file_exists
                        ? `${query.data.catalog_file_size} MB`
                        : '—'}
                    </span>
                  </div>
                  <Badge variant={query.data.catalog_file_exists ? 'ok' : 'out'}>
                    {query.data.catalog_file_exists ? S.catalog_present : S.catalog_missing}
                  </Badge>
                </li>
              </dl>
              {/*
                The import action is NOT rendered. On Blade it triggers a
                long-running artisan command through a web route with no progress
                channel in this SPA, and the API exposes no equivalent endpoint —
                so a button here would be a dead control. The catalogue's current
                state is shown instead, which is honest and needs no endpoint.
              */}
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}

/** One settings control, rendered by `kind`. */
function SettingField({
  field,
  label,
  options,
  value,
  onChange,
}: {
  field: FieldSpec;
  /** Resolved label — looked up by the caller so this component stays dumb. */
  label: string;
  options?: { value: string; label: string }[];
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  if (field.kind === 'toggle') {
    /*
     * A switch is a real `<input type="checkbox">` inside its label, so the
     * whole row toggles and the control is keyboard-reachable. `role="switch"`
     * makes the on/off state explicit to assistive tech.
     */
    return (
      <div className="admin-field admin-field--toggle">
        <label className="admin-switch">
          <input
            type="checkbox"
            role="switch"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="admin-switch__track" aria-hidden="true" />
          <span className="admin-switch__label">{label}</span>
        </label>
      </div>
    );
  }

  return (
    <label className="admin-field">
      <span>{label}</span>
      {field.kind === 'textarea' ? (
        <textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === 'select' ? (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {(options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.kind === 'number' ? 'number' : field.kind}
          dir={field.kind === 'number' || field.kind === 'tel' || field.kind === 'email' ? 'ltr' : undefined}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
