import type { Pagination } from '@/api/adminTypes';
import { AR } from '@/lib/i18n';

/**
 * Small shared helpers for admin screens.
 *
 * Kept in one module so four screens do not each re-implement number
 * formatting and pagination labels slightly differently.
 */

/**
 * Format a count for display.
 *
 * The API can return a numeric string from MySQL aggregates
 * (`SUM()`/`COUNT()` come back as strings over some drivers), so this coerces
 * rather than assuming a number — comparing a string to a number silently fails
 * in JS and would mislabel a stock level.
 */
export function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Format a decimal price, or `—` when unknown. */
export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '—';
  return `${parsed.toFixed(2)} ₪`;
}

/** Localised date, or `—` when absent. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Localised date + time. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A relative "time ago" label, Arabic. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `قبل ${months} شهر`;
  return `قبل ${Math.floor(months / 12)} سنة`;
}

/** Interpolate `{token}` placeholders in an Arabic string. */
export function tpl(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}

/**
 * Pagination range + label.
 *
 * Returns `null` for `from`/`to` when the page is empty, so the caller can show
 * "0 results" rather than a nonsensical "showing 51–50 of 50".
 */
export function pageInfo(pagination: Pagination): {
  from: number;
  to: number;
  total: number;
  label: string;
} {
  const { current_page, per_page, total } = pagination;
  if (total === 0) {
    return { from: 0, to: 0, total: 0, label: AR.admin.common.results.replace('{count}', '0') };
  }
  const from = (current_page - 1) * per_page + 1;
  const to = Math.min(current_page * per_page, total);
  return {
    from,
    to,
    total,
    label: tpl(AR.admin.common.showing, { from, to, total }),
  };
}

/** Debounce value — used by the search inputs (mirrors the Blade 300ms delay). */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms = 350,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
