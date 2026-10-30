/**
 * Working-hours helpers shared by the two profile screens
 * (`ProfilePage` and `ProfileCompletePage`).
 *
 * Extracted because both screens edit the same server contract, and getting it
 * wrong in one place only would silently corrupt the week.
 *
 * The contract (`PharmacyProfileController`):
 *  - day keys are the SHORT form, in `DAY_MAP` order:
 *    `sat, sun, mon, tue, wed, thu, fri`;
 *  - there is **no `is_closed` flag** — a closed day is `{open: null, close: null}`;
 *  - saving is a **FULL REPLACE**: `replaceWorkingHours()` writes all seven days
 *    and treats an omitted or empty day as CLOSED. A request that sends only the
 *    edited days would close every other day.
 */
import type { ApiDayKey, ApiPharmacyProfile } from '@/api/pharmacyTypes';

/** `DAY_MAP` order from the controller, with Arabic labels. */
export const API_DAYS: ReadonlyArray<{ key: ApiDayKey; name: string }> = [
  { key: 'sat', name: 'السبت' },
  { key: 'sun', name: 'الأحد' },
  { key: 'mon', name: 'الاثنين' },
  { key: 'tue', name: 'الثلاثاء' },
  { key: 'wed', name: 'الأربعاء' },
  { key: 'thu', name: 'الخميس' },
  { key: 'fri', name: 'الجمعة' },
];

export interface DayState {
  closed: boolean;
  open: string;
  close: string;
  /** True when the times are the 00:00–23:59 full-day pair. */
  h24: boolean;
}

export type HoursState = Record<ApiDayKey, DayState>;

/** A day is open only when BOTH times are present — the API has no closed flag. */
export function isDayOpen(
  hour: { open: string | null; close: string | null } | undefined,
): boolean {
  return Boolean(hour?.open && hour?.close);
}

/** Normalise a time string to HH:mm format, stripping any trailing seconds (:ss). */
export function normalizeTime(val: string | null | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
}

/** Build editable state from the profile payload (or an empty week). */
export function initHours(profile: ApiPharmacyProfile | null): HoursState {
  const out = {} as HoursState;
  for (const d of API_DAYS) {
    const row = profile?.working_hours?.[d.key];
    const open = normalizeTime(row?.open);
    const close = normalizeTime(row?.close);
    out[d.key] = {
      closed: !isDayOpen(row ?? undefined),
      open,
      close,
      h24: open === '00:00' && (close === '23:59' || close === '24:00'),
    };
  }
  return out;
}

/**
 * Serialise the week for the save request.
 *
 * MUST include all seven days — see the full-replace note above.
 * Days marked closed or lacking open/close times are serialised as empty objects (closed).
 */
export function buildHoursPayload(
  hours: HoursState,
): Record<string, { open?: string; close?: string }> {
  const out: Record<string, { open?: string; close?: string }> = {};
  for (const d of API_DAYS) {
    const s = hours[d.key];
    if (s.closed || !s.open || !s.close) {
      out[d.key] = {};
    } else {
      out[d.key] = { open: s.open, close: s.close };
    }
  }
  return out;
}

/** The label shown on a day card. */
export function dayLabel(s: DayState, closedText: string, open24Text: string): string {
  if (s.closed) return closedText;
  if (s.h24) return open24Text;
  return `${s.open || '—'} – ${s.close || '—'}`;
}
